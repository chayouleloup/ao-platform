'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  generateChecklist,
  addChecklistItem,
  updateItemStatus,
  registerItemUpload,
  deleteChecklistItem,
  checkExportBlocks,
} from '@/lib/actions/conformite'
import type { ChecklistItem, ChecklistCategory, ChecklistStatus } from '@/types/conformite'
import { STATUS_CONFIG, CATEGORY_CONFIG, CHARACTER_CONFIG, LINKED_OUTPUT_MAP } from '@/types/conformite'

interface Props {
  project: any
  lots: any[]
  allItems: ChecklistItem[]
  extractions: any[]
}

const CATEGORIES: ChecklistCategory[] = ['candidature', 'offre_technique', 'offre_financiere', 'conditionnel']

export function ConformiteClient({ project, lots, allItems, extractions }: Props) {
  const [selectedLotId, setSelectedLotId] = useState<string>(lots[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [showAddModal, setShowAddModal] = useState(false)
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null)
  const [exportBlocks, setExportBlocks] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedLot = lots.find(l => l.id === selectedLotId)
  const lotItems = allItems.filter(i => i.lot_id === selectedLotId)
  const hasExtraction = extractions.some(e => e.lot_id === selectedLotId)
  const hasItems = lotItems.length > 0

  // Stats du lot sélectionné
  const stats = {
    total: lotItems.filter(i => i.character !== 'recommande').length,
    fourni: lotItems.filter(i => i.status === 'fourni').length,
    manquant: lotItems.filter(i => i.status === 'manquant' && i.character === 'obligatoire').length,
    perime: lotItems.filter(i => i.status === 'perime').length,
    na: lotItems.filter(i => i.status === 'non_applicable').length,
  }
  const scorePct = stats.total > 0
    ? Math.round(((stats.fourni + stats.na) / stats.total) * 100)
    : 0

  const isBlocked = stats.manquant > 0 || stats.perime > 0

  async function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const r = await generateChecklist(project.id, selectedLotId)
      if (r?.error) setError(r.error)
    })
  }

  async function handleStatusChange(itemId: string, status: ChecklistStatus) {
    startTransition(() => updateItemStatus(itemId, status))
  }

  async function handleUpload(itemId: string, file: File, expiresAt?: string) {
    setUploadingItemId(itemId)
    const supabase = createClient()

    const path = `${project.company_id}/checklist/${selectedLotId}/${Date.now()}_${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('company-documents')
      .upload(path, file)

    if (uploadErr) { setUploadingItemId(null); return }

    const { data: { publicUrl } } = supabase.storage.from('company-documents').getPublicUrl(path)

    await registerItemUpload({
      itemId,
      fileName: file.name,
      fileUrl: publicUrl,
      fileSize: file.size,
      mimeType: file.type,
      expiresAt,
    })
    setUploadingItemId(null)
  }

  async function handleCheckBlocks() {
    const result = await checkExportBlocks(selectedLotId)
    setExportBlocks(result.blocks)
  }

  async function handleAddItem(formData: FormData) {
    await addChecklistItem(selectedLotId, project.id, formData)
    setShowAddModal(false)
  }

  // Grouper par catégorie
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = lotItems.filter(i => i.category === cat)
    return acc
  }, {} as Record<ChecklistCategory, ChecklistItem[]>)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {project.title}
        </Link>
        <h1 className="text-2xl font-bold text-white">✅ Moteur de conformité</h1>
        <p className="text-slate-400 text-sm mt-1">
          Checklist intelligente par lot — l'export est bloqué tant que les pièces obligatoires ne sont pas toutes fournies.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-6">

        {/* COLONNE GAUCHE */}
        <div className="space-y-4">

          {/* Sélection du lot */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Lot</h3>
            <div className="space-y-1.5">
              {lots.map(lot => {
                const lotItems2 = allItems.filter(i => i.lot_id === lot.id)
                const lotManquant = lotItems2.filter(i => i.status === 'manquant' && i.character === 'obligatoire').length
                const lotTotal = lotItems2.filter(i => i.character !== 'recommande').length
                const lotFourni = lotItems2.filter(i => ['fourni','non_applicable'].includes(i.status)).length
                const pct = lotTotal > 0 ? Math.round((lotFourni / lotTotal) * 100) : 0

                return (
                  <button
                    key={lot.id}
                    onClick={() => setSelectedLotId(lot.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                      selectedLotId === lot.id
                        ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                        : 'text-slate-400 hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">Lot {lot.number}</span>
                      {lotManquant > 0
                        ? <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full font-medium">{lotManquant} ✗</span>
                        : lotTotal > 0
                          ? <span className="text-[10px] text-green-400">✓ {pct}%</span>
                          : null}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{lot.title}</p>
                    {lotTotal > 0 && (
                      <div className="mt-1.5 w-full bg-slate-700 rounded-full h-1">
                        <div className={`h-1 rounded-full ${pct === 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Actions</h3>

            <button
              onClick={handleGenerate}
              disabled={isPending || !hasExtraction}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              {isPending ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Génération...</>
              ) : '⚡ Générer depuis l\'analyse'}
            </button>

            {!hasExtraction && (
              <p className="text-[10px] text-amber-400 text-center">
                Lancez d'abord l'analyse DCE
              </p>
            )}

            <button
              onClick={() => setShowAddModal(true)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium py-2 rounded-lg transition-all"
            >
              + Ajouter manuellement
            </button>

            <button
              onClick={handleCheckBlocks}
              className="w-full border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-sm font-medium py-2 rounded-lg transition-all"
            >
              🔒 Vérifier les blocages
            </button>
          </div>

          {/* Blocages d'export */}
          {exportBlocks !== null && (
            <div className={`border rounded-xl p-4 ${exportBlocks.length === 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <h3 className="text-xs font-medium mb-3 uppercase tracking-wider text-slate-400">Blocages export</h3>
              {exportBlocks.length === 0 ? (
                <div className="text-center">
                  <p className="text-2xl mb-1">✅</p>
                  <p className="text-sm font-medium text-green-400">Export autorisé</p>
                  <p className="text-xs text-slate-500 mt-0.5">Toutes les pièces sont fournies</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {exportBlocks.map((b, i) => (
                    <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-red-300">🚫 Export {b.type}</p>
                      <p className="text-[10px] text-red-400/80 mt-0.5">{b.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* COLONNE PRINCIPALE */}
        <div className="col-span-3 space-y-4">

          {/* Score global du lot */}
          <div className={`border rounded-xl p-5 flex items-center gap-6 ${
            isBlocked ? 'bg-red-500/5 border-red-500/20' : scorePct === 100 ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-800/40 border-slate-700/50'
          }`}>
            {/* Jauge circulaire */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none"
                  stroke={scorePct === 100 ? '#22c55e' : isBlocked ? '#ef4444' : '#3b82f6'}
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - scorePct / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-bold ${scorePct === 100 ? 'text-green-400' : isBlocked ? 'text-red-400' : 'text-white'}`}>
                  {scorePct}%
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 grid grid-cols-4 gap-4">
              {[
                { label: 'Fournis', value: stats.fourni, color: 'text-green-400' },
                { label: 'Manquants', value: stats.manquant, color: stats.manquant > 0 ? 'text-red-400' : 'text-slate-400' },
                { label: 'Périmés', value: stats.perime, color: stats.perime > 0 ? 'text-amber-400' : 'text-slate-400' },
                { label: 'N/A', value: stats.na, color: 'text-slate-500' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Statut export */}
            <div className={`flex-shrink-0 px-4 py-3 rounded-xl border text-center ${
              isBlocked ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'
            }`}>
              <p className="text-2xl mb-0.5">{isBlocked ? '🚫' : '✅'}</p>
              <p className={`text-xs font-bold ${isBlocked ? 'text-red-400' : 'text-green-400'}`}>
                Export {isBlocked ? 'bloqué' : 'autorisé'}
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Checklist vide */}
          {!hasItems && (
            <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-white font-medium mb-1">Checklist vide</p>
              <p className="text-slate-400 text-sm mb-4">
                {hasExtraction
                  ? 'Cliquez sur "Générer depuis l\'analyse" pour créer automatiquement la checklist.'
                  : 'Lancez d\'abord l\'analyse DCE pour ce lot.'}
              </p>
              {hasExtraction ? (
                <button onClick={handleGenerate} disabled={isPending} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
                  ⚡ Générer la checklist
                </button>
              ) : (
                <Link href={`/projets/${project.id}/analyse`} className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
                  → Lancer l'analyse DCE
                </Link>
              )}
            </div>
          )}

          {/* Checklist par catégorie */}
          {CATEGORIES.map(cat => {
            const catItems = grouped[cat] ?? []
            if (!catItems.length) return null
            const cfg = CATEGORY_CONFIG[cat]
            const catManquant = catItems.filter(i => i.status === 'manquant' && i.character === 'obligatoire').length

            return (
              <CategorySection
                key={cat}
                category={cat}
                items={catItems}
                config={cfg}
                manquantCount={catManquant}
                onStatusChange={handleStatusChange}
                onUpload={handleUpload}
                onDelete={deleteChecklistItem}
                uploadingItemId={uploadingItemId}
                isPending={isPending}
              />
            )
          })}
        </div>
      </div>

      {/* Modal ajout manuel */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="font-semibold text-white">Ajouter une pièce</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form action={handleAddItem} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nom de la pièce *</label>
                <input name="name" required className={inp} placeholder="Ex: Attestation de capacité financière" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Catégorie</label>
                  <select name="category" className={inp}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_CONFIG[c].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Caractère</label>
                  <select name="character" className={inp}>
                    <option value="obligatoire">Obligatoire</option>
                    <option value="conditionnel">Conditionnel</option>
                    <option value="recommande">Recommandé</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Format attendu</label>
                  <input name="expected_format" className={inp} placeholder="PDF, XLSX..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Périmètre</label>
                  <select name="scope" className={inp}>
                    <option value="lot">Lot</option>
                    <option value="commun">Commun</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Référence source (optionnel)</label>
                <input name="source_ref" className={inp} placeholder="RC Article 5.2" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-all">Ajouter</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CategorySection ──────────────────────────────────────────

function CategorySection({
  category, items, config, manquantCount,
  onStatusChange, onUpload, onDelete, uploadingItemId, isPending
}: {
  category: ChecklistCategory
  items: ChecklistItem[]
  config: typeof CATEGORY_CONFIG[ChecklistCategory]
  manquantCount: number
  onStatusChange: (id: string, status: ChecklistStatus) => void
  onUpload: (id: string, file: File, expires?: string) => void
  onDelete: (id: string) => void
  uploadingItemId: string | null
  isPending: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  const colorMap: Record<string, string> = {
    blue: 'border-blue-500/20 bg-blue-600/5',
    purple: 'border-purple-500/20 bg-purple-600/5',
    green: 'border-green-500/20 bg-green-600/5',
    amber: 'border-amber-500/20 bg-amber-600/5',
  }

  const headerColorMap: Record<string, string> = {
    blue: 'bg-blue-600/10',
    purple: 'bg-purple-600/10',
    green: 'bg-green-600/10',
    amber: 'bg-amber-600/10',
  }

  return (
    <div className={`border rounded-xl overflow-hidden ${colorMap[config.color]}`}>
      {/* Header catégorie */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center justify-between px-5 py-3.5 ${headerColorMap[config.color]}`}
      >
        <div className="flex items-center gap-2">
          <span>{config.icon}</span>
          <h3 className="font-semibold text-white text-sm">{config.label}</h3>
          <span className="text-xs text-slate-500">{items.length} pièce{items.length > 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {manquantCount > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-medium">
              {manquantCount} manquant{manquantCount > 1 ? 's' : ''}
            </span>
          )}
          <svg className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <div className="divide-y divide-slate-800/60">
          {items.map(item => (
            <ChecklistRow
              key={item.id}
              item={item}
              onStatusChange={onStatusChange}
              onUpload={onUpload}
              onDelete={onDelete}
              isUploading={uploadingItemId === item.id}
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ChecklistRow ─────────────────────────────────────────────

function ChecklistRow({ item, onStatusChange, onUpload, onDelete, isUploading, isPending }: {
  item: ChecklistItem
  onStatusChange: (id: string, s: ChecklistStatus) => void
  onUpload: (id: string, f: File, e?: string) => void
  onDelete: (id: string) => void
  isUploading: boolean
  isPending: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const statusCfg = STATUS_CONFIG[item.status]
  const charCfg = CHARACTER_CONFIG[item.character]

  const isExpired = item.document_expires_at && new Date(item.document_expires_at) < new Date()
  const isExpiringSoon = item.document_expires_at && !isExpired &&
    new Date(item.document_expires_at) < new Date(Date.now() + 30 * 86400000)

  return (
    <div className={`px-5 py-3.5 group transition-colors ${
      item.status === 'manquant' && item.character === 'obligatoire'
        ? 'bg-red-500/3 hover:bg-red-500/5'
        : item.status === 'perime'
          ? 'bg-amber-500/3 hover:bg-amber-500/5'
          : 'hover:bg-slate-800/30'
    }`}>
      <div className="flex items-start gap-3">
        {/* Statut icône */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border text-xs font-bold ${statusCfg.bg} ${statusCfg.border} ${statusCfg.color}`}>
          {statusCfg.icon}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">{item.name}</span>
                <span className={`text-[10px] font-medium ${charCfg.color}`}>{charCfg.label}</span>
                {item.linked_output && (
                  <span className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                    {LINKED_OUTPUT_MAP[item.linked_output] ?? item.linked_output}
                  </span>
                )}
                {item.source_type === 'manuel' && (
                  <span className="text-[10px] text-slate-600">manuel</span>
                )}
              </div>

              {/* Sous-infos */}
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {item.source_ref && <span className="text-[10px] text-slate-500">📄 {item.source_ref}</span>}
                {item.expected_format && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{item.expected_format}</span>}
                {item.document_name && (
                  <span className={`text-[10px] ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-green-400'}`}>
                    📎 {item.document_name}
                    {item.document_expires_at && ` · exp. ${new Date(item.document_expires_at).toLocaleDateString('fr-FR')}`}
                  </span>
                )}
              </div>

              {/* Zone d'upload étendue */}
              {expanded && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={e => setExpiresAt(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs"
                      placeholder="Date d'expiration"
                    />
                    <span className="text-xs text-slate-500">(optionnel)</span>
                  </div>
                  <label className="cursor-pointer flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {isUploading ? 'Upload...' : 'Choisir un fichier'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { onUpload(item.id, f, expiresAt || undefined); setExpanded(false) }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Changer statut rapide */}
              <select
                value={item.status}
                disabled={isPending}
                onChange={e => onStatusChange(item.id, e.target.value as ChecklistStatus)}
                className={`text-xs border rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}
              >
                <option value="manquant">✗ Manquant</option>
                <option value="fourni">✓ Fourni</option>
                <option value="perime">⚠ Périmé</option>
                <option value="non_applicable">— N/A</option>
              </select>

              {/* Upload */}
              <button
                onClick={() => setExpanded(e => !e)}
                className={`p-1.5 rounded transition-colors ${expanded ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100'}`}
                title="Uploader le document"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>

              {/* Supprimer (manuel seulement) */}
              {item.source_type === 'manuel' && (
                <button
                  onClick={() => onDelete(item.id)}
                  className="p-1.5 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const inp = `w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`
