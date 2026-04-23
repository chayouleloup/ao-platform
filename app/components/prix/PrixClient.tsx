'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  registerPrixFichier,
  launchPrixMapping,
  updatePrixLigne,
  resolveAnomalie,
  validatePrixGlobal,
} from '@/lib/actions/prix'
import type { PrixFichier, PrixLigne, PrixAnomalie } from '@/types/prix'
import { PRIX_STATUS_CONFIG, ANOMALIE_CONFIG, formatEur, formatNum } from '@/types/prix'

interface Props {
  project: any
  lots: any[]
  fichiers: PrixFichier[]
  prixClient: any[]
}

export function PrixClient({ project, lots, fichiers: initialFichiers, prixClient }: Props) {
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [fichiers, setFichiers] = useState(initialFichiers)
  const [lignes, setLignes] = useState<PrixLigne[]>([])
  const [anomalies, setAnomalies] = useState<PrixAnomalie[]>([])
  const [activeTab, setActiveTab] = useState<'lignes' | 'anomalies' | 'biblio'>('lignes')
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [isMapping, setIsMapping] = useState(false)
  const [validationModal, setValidationModal] = useState(false)
  const [validationNote, setValidationNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lotFichier = fichiers.find(f => f.lot_id === selectedLotId)
  const statusCfg = lotFichier ? PRIX_STATUS_CONFIG[lotFichier.status] : null

  const anomaliesBloquantes = anomalies.filter(a => a.severity === 'bloquante' && !a.resolved)
  const anomaliesAttention = anomalies.filter(a => a.severity === 'attention' && !a.resolved)
  const canValidate = anomaliesBloquantes.length === 0 && lignes.length > 0

  function showSuccess(msg: string) {
    setSuccess(msg); setTimeout(() => setSuccess(null), 3000)
  }

  // Charger les lignes + anomalies d'un fichier
  async function loadFichierData(fichierId: string) {
    const supabase = createClient()
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.from('prix_lignes').select('*').eq('fichier_id', fichierId).order('display_order'),
      supabase.from('prix_anomalies').select('*').eq('fichier_id', fichierId).order('created_at'),
    ])
    setLignes(l ?? [])
    setAnomalies(a ?? [])
  }

  // Upload + parsing Excel
  async function handleFileUpload(file: File) {
    setIsUploading(true)
    setError(null)

    try {
      // Charger SheetJS depuis CDN
      if (!(window as any).XLSX) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
          s.onload = () => resolve()
          s.onerror = reject
          document.head.appendChild(s)
        })
      }
      const XLSX = (window as any).XLSX

      // Parser le fichier
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      // Parser chaque feuille
      const parsedLines: any[] = []
      let displayOrder = 0

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

        for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
          const row = rows[rowIdx]
          if (!row || row.every((c: any) => c === null || c === '')) continue

          const textCols = row.filter((c: any) => typeof c === 'string' && c.trim().length > 2)
          if (!textCols.length) continue

          const designation = textCols[0]?.toString().trim()
          const numCols = row.filter((c: any) => typeof c === 'number')
          const isSectionHeader = designation === designation.toUpperCase() && numCols.length === 0
          const isSubtotal = /sous.{0,5}total|total\s*:/i.test(designation)

          const unitePattern = /^(m²|m2|ml|m³|m3|u|pce|pcs|ens|kg|t|h|j|ff|ha|l|nb|fo|lot|forfait)$/i
          let unite = null
          for (let i = 1; i < row.length; i++) {
            if (typeof row[i] === 'string' && unitePattern.test(row[i].trim())) {
              unite = row[i].trim(); break
            }
          }

          let quantite = null, pu = null, montant = null
          const nums = row.filter((c: any) => typeof c === 'number')
          if (nums.length >= 3) { quantite = nums[nums.length - 3]; pu = nums[nums.length - 2]; montant = nums[nums.length - 1] }
          else if (nums.length === 2) { quantite = nums[0]; montant = nums[1] }
          else if (nums.length === 1) { montant = nums[0] }

          parsedLines.push({
            sheet_name: sheetName,
            row_index: rowIdx,
            display_order: displayOrder++,
            designation,
            unite,
            quantite,
            pu,
            montant,
            is_section_header: isSectionHeader,
            is_subtotal: isSubtotal,
          })
        }
      }

      // Upload vers Supabase Storage
      const supabase = createClient()
      const path = `${project.company_id}/prix/${selectedLotId}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from('company-documents').upload(path, file)
      if (uploadErr) throw new Error(uploadErr.message)

      const { data: { publicUrl } } = supabase.storage.from('company-documents').getPublicUrl(path)

      // Détecter le type
      const docType = /bpu/i.test(file.name) ? 'BPU' : /dqe/i.test(file.name) ? 'DQE' : 'DPGF'

      const result = await registerPrixFichier({
        projectId: project.id,
        lotId: selectedLotId,
        fileName: file.name,
        fileUrl: publicUrl,
        fileSize: file.size,
        docType,
        parsedLines,
      })

      if (result?.error) throw new Error(result.error)

      showSuccess(`${parsedLines.length} lignes importées`)

      // Rafraîchir les données
      if (result.fichierId) {
        await loadFichierData(result.fichierId)
      }

    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
    }
  }

  async function handleLaunchMapping() {
    if (!lotFichier) return
    setIsMapping(true)
    setError(null)

    const result = await launchPrixMapping(lotFichier.id)
    setIsMapping(false)

    if (result?.error) setError(result.error)
    else {
      showSuccess(`Mapping terminé — ${result.mapped} PU proposés, ${result.anomalies} anomalies`)
      await loadFichierData(lotFichier.id)
      setFichiers(prev => prev.map(f => f.id === lotFichier.id ? { ...f, status: 'a_valider' } : f))
    }
  }

  async function handleUpdateLigne(ligneId: string, field: 'pu' | 'quantite' | 'unite', value: any) {
    await updatePrixLigne(ligneId, { [field]: value === '' ? null : value })
    setLignes(prev => prev.map(l => {
      if (l.id !== ligneId) return l
      const updated = { ...l, [field]: value === '' ? null : Number(value) }
      if (field === 'pu' || field === 'quantite') {
        updated.montant = updated.pu && updated.quantite ? Math.round(updated.pu * updated.quantite * 100) / 100 : null
      }
      return updated
    }))
  }

  async function handleResolveAnomalie(anomalieId: string) {
    await resolveAnomalie(anomalieId)
    setAnomalies(prev => prev.map(a => a.id === anomalieId ? { ...a, resolved: true } : a))
  }

  async function handleValidate() {
    if (!lotFichier) return
    startTransition(async () => {
      const result = await validatePrixGlobal(lotFichier.id, validationNote)
      if (result?.error) setError(result.error)
      else {
        setValidationModal(false)
        setFichiers(prev => prev.map(f => f.id === lotFichier.id ? { ...f, status: 'valide' } : f))
        showSuccess('Offre financière validée ✓')
      }
    })
  }

  // Total calculé
  const totalHT = lignes
    .filter(l => !l.is_section_header && !l.is_subtotal)
    .reduce((sum, l) => sum + (l.montant ?? 0), 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {project.title}
        </Link>
        <h1 className="text-2xl font-bold text-white">💶 Module Prix</h1>
        <p className="text-slate-400 text-sm mt-1">Import DPGF/BPU/DQE · Mapping IA · Contrôles · Validation globale</p>
      </div>

      {(error || success) && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${error ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-green-500/10 border border-green-500/30 text-green-400'}`}>
          {error ?? success}
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">

        {/* COLONNE GAUCHE */}
        <div className="space-y-4">

          {/* Sélection lot */}
          {lots.length > 1 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Lot</h3>
              <div className="space-y-1.5">
                {lots.map((lot: any) => {
                  const lf = fichiers.find(f => f.lot_id === lot.id)
                  return (
                    <button
                      key={lot.id}
                      onClick={() => {
                        setSelectedLotId(lot.id)
                        if (lf) loadFichierData(lf.id)
                        else { setLignes([]); setAnomalies([]) }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                        selectedLotId === lot.id
                          ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                          : 'text-slate-400 hover:bg-slate-700/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>Lot {lot.number}</span>
                        {lf && <span className={`text-[10px] ${PRIX_STATUS_CONFIG[lf.status].color}`}>{PRIX_STATUS_CONFIG[lf.status].label}</span>}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{lot.title}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Statut & actions */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</h3>

            {/* Upload */}
            {!lotFichier ? (
              <div>
                <div
                  className="border-2 border-dashed border-slate-600 hover:border-blue-500/50 rounded-xl p-6 text-center cursor-pointer transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
                >
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
                  <p className="text-2xl mb-1">{isUploading ? '⏳' : '📊'}</p>
                  <p className="text-sm text-slate-400 font-medium">{isUploading ? 'Import...' : 'Importer le DPGF/BPU/DQE'}</p>
                  <p className="text-xs text-slate-600 mt-0.5">XLSX · glisser-déposer</p>
                </div>
              </div>
            ) : (
              <>
                {/* Statut */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${statusCfg?.bg} ${statusCfg?.color} ${statusCfg?.border}`}>
                  <span>{statusCfg?.label}</span>
                </div>

                {/* Infos fichier */}
                <div className="text-xs text-slate-500 space-y-1">
                  <p>📊 {lotFichier.file_name}</p>
                  <p>{lotFichier.lines_count} lignes · {lotFichier.mapped_count} mappées</p>
                  {lotFichier.total_ht && <p className="text-green-400 font-medium text-sm">Total HT : {formatEur(lotFichier.total_ht)}</p>}
                </div>

                {/* Lancer mapping */}
                {lotFichier.status === 'importe' && (
                  <button
                    onClick={handleLaunchMapping}
                    disabled={isMapping}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isMapping ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Mapping IA...</> : '⚡ Lancer le mapping IA'}
                  </button>
                )}

                {/* Validation globale */}
                {['a_valider'].includes(lotFichier.status) && (
                  <button
                    onClick={() => setValidationModal(true)}
                    disabled={!canValidate}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      canValidate
                        ? 'bg-green-600 hover:bg-green-500 text-white'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                    title={!canValidate ? `${anomaliesBloquantes.length} anomalie(s) bloquante(s) à traiter` : ''}
                  >
                    {canValidate ? '✓ Valider l\'offre financière' : `🚫 ${anomaliesBloquantes.length} anomalie(s) bloquante(s)`}
                  </button>
                )}

                {lotFichier.status === 'valide' && (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-center">
                    <p className="text-green-400 font-medium text-sm">✓ Offre financière validée</p>
                    <p className="text-xs text-slate-500 mt-0.5">{lotFichier.validated_at && new Date(lotFichier.validated_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}

                {/* Ré-importer */}
                <button onClick={() => fileInputRef.current?.click()} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors">
                  ↺ Ré-importer le fichier
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }} />
                </button>
              </>
            )}
          </div>

          {/* Anomalies résumé */}
          {anomalies.length > 0 && (
            <div className={`border rounded-xl p-4 ${anomaliesBloquantes.length > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Anomalies</h3>
              <div className="space-y-1">
                {anomaliesBloquantes.length > 0 && (
                  <p className="text-sm font-medium text-red-400">🚫 {anomaliesBloquantes.length} bloquante{anomaliesBloquantes.length > 1 ? 's' : ''}</p>
                )}
                {anomaliesAttention.length > 0 && (
                  <p className="text-sm text-amber-400">⚠️ {anomaliesAttention.length} à surveiller</p>
                )}
                {anomalies.filter(a => a.resolved).length > 0 && (
                  <p className="text-xs text-slate-500">✓ {anomalies.filter(a => a.resolved).length} résolues</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* COLONNE PRINCIPALE */}
        <div className="col-span-3">
          {!lotFichier ? (
            <div className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-16 text-center">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-white font-medium mb-1">Aucun fichier importé</p>
              <p className="text-slate-400 text-sm">Importez le DPGF/BPU/DQE fourni par l'acheteur.</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1">
                  {[
                    { id: 'lignes', label: `📋 Lignes (${lignes.length})` },
                    { id: 'anomalies', label: `⚠️ Anomalies (${anomalies.filter(a => !a.resolved).length})` },
                    { id: 'biblio', label: `📚 Prix client (${prixClient.length})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === tab.id
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Total */}
                {totalHT > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total HT calculé</p>
                    <p className="text-xl font-bold text-green-400">{formatEur(totalHT)}</p>
                  </div>
                )}
              </div>

              {/* Lignes */}
              {activeTab === 'lignes' && (
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
                  {lignes.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-slate-500 text-sm">Lancez le mapping IA pour analyser les lignes.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 bg-slate-800/50">
                            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400 w-8">#</th>
                            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400">Désignation</th>
                            <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-400 w-16">Unité</th>
                            <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 w-24">Quantité</th>
                            <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 w-28">PU (€)</th>
                            <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 w-28">Montant (€)</th>
                            <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-400 w-16">Confiance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {lignes.map(ligne => {
                            if (ligne.is_section_header) {
                              return (
                                <tr key={ligne.id} className="bg-slate-700/20">
                                  <td className="px-3 py-2 text-xs text-slate-600">{ligne.row_index + 1}</td>
                                  <td colSpan={6} className="px-3 py-2 font-semibold text-slate-300 uppercase text-xs tracking-wide">
                                    {ligne.designation}
                                  </td>
                                </tr>
                              )
                            }
                            if (ligne.is_subtotal) {
                              return (
                                <tr key={ligne.id} className="bg-blue-600/5">
                                  <td className="px-3 py-2 text-xs text-slate-600">{ligne.row_index + 1}</td>
                                  <td className="px-3 py-2 text-blue-300 font-medium text-xs italic">{ligne.designation}</td>
                                  <td colSpan={3} />
                                  <td className="px-3 py-2 text-right text-blue-300 font-medium text-xs">{formatEur(ligne.montant)}</td>
                                  <td />
                                </tr>
                              )
                            }

                            const hasAnomalie = anomalies.some(a => a.ligne_id === ligne.id && !a.resolved)
                            const conf = ligne.mapping_confidence ?? 0

                            return (
                              <tr key={ligne.id} className={`hover:bg-slate-800/30 transition-colors ${hasAnomalie ? 'bg-amber-500/5' : ''}`}>
                                <td className="px-3 py-2 text-xs text-slate-600">{ligne.row_index + 1}</td>
                                <td className="px-3 py-2">
                                  <p className="text-white text-xs">{ligne.designation}</p>
                                  {ligne.matched_article && (
                                    <p className="text-[10px] text-slate-500 mt-0.5">↳ {ligne.matched_article}</p>
                                  )}
                                  {hasAnomalie && <span className="text-[10px] text-amber-400">⚠ anomalie</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <EditableCell
                                    value={ligne.unite ?? ''}
                                    type="text"
                                    onSave={v => handleUpdateLigne(ligne.id, 'unite', v)}
                                    className="w-14 text-center text-xs text-slate-300"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <EditableCell
                                    value={ligne.quantite ?? ''}
                                    type="number"
                                    onSave={v => handleUpdateLigne(ligne.id, 'quantite', v)}
                                    className="w-20 text-right text-xs text-white"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <EditableCell
                                    value={ligne.pu ?? ''}
                                    type="number"
                                    onSave={v => handleUpdateLigne(ligne.id, 'pu', v)}
                                    className="w-24 text-right text-xs font-medium text-blue-300"
                                    placeholder="— Saisir PU"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`text-xs font-medium ${ligne.montant ? 'text-white' : 'text-slate-600'}`}>
                                    {formatEur(ligne.montant)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {ligne.mapping_confidence !== null && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                      conf >= 0.8 ? 'bg-green-500/10 text-green-400' :
                                      conf >= 0.5 ? 'bg-amber-500/10 text-amber-400' :
                                      'bg-red-500/10 text-red-400'
                                    }`}>
                                      {Math.round(conf * 100)}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        {/* Pied de tableau */}
                        {totalHT > 0 && (
                          <tfoot>
                            <tr className="border-t-2 border-slate-600 bg-slate-800/50">
                              <td colSpan={5} className="px-3 py-3 text-right text-sm font-bold text-white">TOTAL HT</td>
                              <td className="px-3 py-3 text-right text-sm font-bold text-green-400">{formatEur(totalHT)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Anomalies */}
              {activeTab === 'anomalies' && (
                <div className="space-y-3">
                  {anomalies.length === 0 ? (
                    <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-8 text-center">
                      <p className="text-2xl mb-2">✅</p>
                      <p className="text-green-400 font-medium">Aucune anomalie détectée</p>
                    </div>
                  ) : (
                    anomalies.map(anomalie => {
                      const cfg = ANOMALIE_CONFIG[anomalie.anomalie_type]
                      return (
                        <div
                          key={anomalie.id}
                          className={`flex items-start gap-3 p-4 border rounded-xl transition-all ${
                            anomalie.resolved
                              ? 'bg-slate-800/20 border-slate-700/30 opacity-50'
                              : anomalie.severity === 'bloquante'
                                ? 'bg-red-500/5 border-red-500/20'
                                : 'bg-amber-500/5 border-amber-500/20'
                          }`}
                        >
                          <span className="text-xl flex-shrink-0">{cfg.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                anomalie.severity === 'bloquante'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}>
                                {anomalie.severity === 'bloquante' ? '🚫 Bloquante' : '⚠️ Attention'}
                              </span>
                              <span className="text-xs text-slate-500">{cfg.label}</span>
                            </div>
                            <p className="text-sm text-white">{anomalie.description}</p>
                            {anomalie.suggestion && <p className="text-xs text-slate-400 mt-1">💡 {anomalie.suggestion}</p>}
                            {anomalie.resolved && <p className="text-xs text-green-400 mt-1">✓ Résolue — {anomalie.resolution_note}</p>}
                          </div>
                          {!anomalie.resolved && (
                            <button
                              onClick={() => handleResolveAnomalie(anomalie.id)}
                              className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                            >
                              Accepter
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* Biblio prix client */}
              {activeTab === 'biblio' && (
                <div>
                  {prixClient.length === 0 ? (
                    <div className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-8 text-center">
                      <p className="text-slate-400 text-sm mb-2">Aucun prix client enregistré.</p>
                      <p className="text-xs text-slate-500">Importez des devis ou saisissez vos prix de référence pour améliorer le mapping IA.</p>
                    </div>
                  ) : (
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 bg-slate-800/50">
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Désignation</th>
                            <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-400 w-16">Unité</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 w-24">PU cible</th>
                            <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400 w-40">Fourchette</th>
                            <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 w-24">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {prixClient.map((p: any) => (
                            <tr key={p.id} className="hover:bg-slate-800/30">
                              <td className="px-4 py-2.5 text-xs text-white">{p.designation}</td>
                              <td className="px-4 py-2.5 text-center text-xs text-slate-400">{p.unite ?? '—'}</td>
                              <td className="px-4 py-2.5 text-right text-xs font-medium text-blue-300">{formatEur(p.pu_cible)}</td>
                              <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                                {p.pu_min && p.pu_max ? `${formatEur(p.pu_min)} – ${formatEur(p.pu_max)}` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-500">{p.source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal validation globale */}
      {validationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-2">Validation globale de l'offre financière</h3>
              <p className="text-slate-400 text-sm mb-4">
                Cette action valide définitivement l'offre financière pour ce lot. L'export Excel deviendra disponible.
              </p>

              {/* Récapitulatif */}
              <div className="bg-slate-800/50 rounded-xl p-4 mb-4 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total HT</span>
                  <span className="text-green-400 font-bold">{formatEur(totalHT)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Lignes</span>
                  <span className="text-white">{lignes.filter(l => !l.is_section_header && !l.is_subtotal).length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Anomalies restantes</span>
                  <span className={anomalies.filter(a => !a.resolved).length > 0 ? 'text-amber-400' : 'text-green-400'}>
                    {anomalies.filter(a => !a.resolved).length}
                  </span>
                </div>
              </div>

              <textarea
                value={validationNote}
                onChange={e => setValidationNote(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 resize-none"
                rows={2}
                placeholder="Note de validation (optionnel)"
              />

              <div className="flex gap-3">
                <button onClick={() => setValidationModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">
                  Annuler
                </button>
                <button
                  onClick={handleValidate}
                  disabled={isPending}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-bold transition-all"
                >
                  {isPending ? 'Validation...' : '✓ Valider l\'offre financière'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Cellule éditable inline
function EditableCell({ value, type, onSave, className, placeholder }: {
  value: string | number
  type: 'text' | 'number'
  onSave: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))

  if (editing) {
    return (
      <input
        type={type}
        value={val}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onSave(val); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        className={`bg-slate-700 border border-blue-500 rounded px-1 py-0.5 focus:outline-none ${className}`}
      />
    )
  }

  return (
    <span
      onClick={() => { setVal(String(value)); setEditing(true) }}
      className={`cursor-pointer hover:bg-slate-700 px-1 py-0.5 rounded transition-colors ${className} ${!value ? 'text-slate-600 italic' : ''}`}
    >
      {value || placeholder || '—'}
    </span>
  )
}
