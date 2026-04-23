'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  checkExportEligibility,
  generateRapportHtmlAction,
  generatePackManifestAction,
  createExportRecord,
  finalizeExport,
} from '@/lib/actions/export'
import { generatePackIndex } from '@/lib/services/pack-builder'

interface Props {
  project: any
  lots: any[]
  exportsHistory: any[]
  company: any
}

type ExportStep = 'idle' | 'checking' | 'rapport' | 'manifest' | 'zip' | 'done' | 'error'

export function ExportClient({ project, lots, exportsHistory, company }: Props) {
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [step, setStep] = useState<ExportStep>('idle')
  const [eligibility, setEligibility] = useState<{ canExport: boolean; blocks: string[]; missingItems: string[] } | null>(null)
  const [manifest, setManifest] = useState<any>(null)
  const [rapportHtml, setRapportHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [previewRapport, setPreviewRapport] = useState(false)
  const [exportId, setExportId] = useState<string | null>(null)

  const selectedLot = lots.find(l => l.id === selectedLotId)
  const primaryColor = company.primary_color ?? '#1a56db'

  const stepMessages: Record<ExportStep, string> = {
    idle: '',
    checking: 'Vérification de l\'éligibilité...',
    rapport: 'Génération du rapport de conformité...',
    manifest: 'Construction du manifest du pack...',
    zip: 'Préparation du pack ZIP...',
    done: 'Export terminé !',
    error: 'Erreur lors de l\'export',
  }

  async function handleStartExport() {
    setError(null)
    setStep('checking')

    // 1. Vérifier l'éligibilité
    const elig = await checkExportEligibility(selectedLotId)
    setEligibility(elig)

    if (!elig.canExport) {
      setStep('idle')
      return
    }

    // 2. Générer le rapport de conformité
    setStep('rapport')
    const html = await generateRapportHtmlAction(project.id, selectedLotId)
    setRapportHtml(html)

    // 3. Construire le manifest
    setStep('manifest')
    const mfst = await generatePackManifestAction(project.id, selectedLotId)
    setManifest(mfst)

    // 4. Créer l'enregistrement d'export
    const exportRecord = await createExportRecord(project.id, selectedLotId)
    if (exportRecord?.error) { setError(exportRecord.error); setStep('error'); return }
    setExportId(exportRecord.exportId!)

    // 5. Générer le ZIP côté client
    setStep('zip')

    try {
      await generateZip(html!, mfst, exportRecord.exportId!)
      setStep('done')
    } catch (err: any) {
      setError(err.message)
      setStep('error')
    }
  }

  async function generateZip(html: string, mfst: any, expId: string) {
    // Charger JSZip depuis CDN
    if (!(window as any).JSZip) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
    }
    const JSZip = (window as any).JSZip
    const zip = new JSZip()

    // Créer les dossiers
    const folders = {
      '01_Candidature':     zip.folder('01_Candidature'),
      '02_Offre_Technique': zip.folder('02_Offre_Technique'),
      '03_Offre_Financiere':zip.folder('03_Offre_Financiere'),
      '04_Annexes':         zip.folder('04_Annexes'),
    }

    // Ajouter le rapport de conformité (HTML → dans les annexes)
    folders['04_Annexes'].file(
      `Rapport_de_conformite_Lot${mfst.lot_number}.html`,
      html
    )

    // Ajouter l'index
    const indexContent = generatePackIndex(mfst)
    zip.file('INDEX_DES_PIECES.txt', indexContent)

    // Ajouter les fichiers disponibles (ceux avec URL)
    const itemsWithFiles = (mfst.items as any[]).filter(i => i.original_url && i.status !== 'manquant')

    for (const item of itemsWithFiles) {
      try {
        const response = await fetch(item.original_url)
        if (!response.ok) continue
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const fileName = item.name.split('/').pop()!
        const folder = folders[item.category as keyof typeof folders]
        if (folder) folder.file(fileName, arrayBuffer)
      } catch {
        // Fichier non accessible — on l'ignore, noté dans l'index
      }
    }

    // Générer le ZIP
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    // Téléchargement automatique
    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Pack_Candidature_${sanitize(mfst.project_title)}_Lot${mfst.lot_number}_${new Date().toISOString().slice(0, 10)}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Finaliser l'enregistrement
    await finalizeExport(expId, mfst)
  }

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = () => resolve()
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  function sanitize(str: string) {
    return str.replace(/[^a-zA-Z0-9_\-À-ÿ]/g, '_').slice(0, 40)
  }

  async function handleDownloadRapport() {
    if (!rapportHtml) {
      const html = await generateRapportHtmlAction(project.id, selectedLotId)
      if (!html) return
      downloadHtml(html, `Rapport_conformite_Lot${selectedLot?.number}.html`)
    } else {
      downloadHtml(rapportHtml, `Rapport_conformite_Lot${selectedLot?.number}.html`)
    }
  }

  function downloadHtml(html: string, name: string) {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const isProcessing = ['checking','rapport','manifest','zip'].includes(step)

  const progressSteps = [
    { id: 'checking', label: 'Vérification éligibilité' },
    { id: 'rapport',  label: 'Rapport de conformité' },
    { id: 'manifest', label: 'Manifest du pack' },
    { id: 'zip',      label: 'Génération ZIP' },
    { id: 'done',     label: 'Export terminé' },
  ]
  const currentStepIdx = progressSteps.findIndex(s => s.id === step)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {project.title}
        </Link>
        <h1 className="text-2xl font-bold text-white">📦 Export pack candidature</h1>
        <p className="text-slate-400 text-sm mt-1">
          Génère le pack ZIP structuré + rapport de conformité PDF
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* COLONNE GAUCHE — Config + état */}
        <div className="space-y-4">

          {/* Sélection lot */}
          {lots.length > 1 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Lot à exporter</h3>
              <div className="space-y-1.5">
                {lots.map(lot => (
                  <button
                    key={lot.id}
                    onClick={() => { setSelectedLotId(lot.id); setStep('idle'); setEligibility(null) }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                      selectedLotId === lot.id
                        ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                        : 'text-slate-400 hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Lot {lot.number}</span>
                      {lot.missing_count > 0
                        ? <span className="text-[10px] text-red-400">✗ {lot.missing_count}</span>
                        : <span className="text-[10px] text-green-400">✓</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{lot.title}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* État du lot sélectionné */}
          {selectedLot && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">État du dossier</h3>

              {[
                { label: 'Pièces manquantes', value: selectedLot.missing_count, ok: selectedLot.missing_count === 0, bad: selectedLot.missing_count > 0 },
                { label: 'Mémoire', value: selectedLot.memoire_status ?? 'Non démarré', ok: selectedLot.memoire_status === 'valide', bad: !selectedLot.memoire_status },
                { label: 'Prix', value: selectedLot.prix_status ?? 'Non importé', ok: selectedLot.prix_status === 'valide', bad: !selectedLot.prix_status },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{item.label}</span>
                  <span className={`text-xs font-medium ${item.ok ? 'text-green-400' : item.bad ? 'text-slate-500' : 'text-amber-400'}`}>
                    {item.ok ? '✓ ' : item.bad ? '— ' : '⚠ '}
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Rapport seul */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Actions</h3>
            <button
              onClick={handleDownloadRapport}
              className="w-full flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium py-2.5 rounded-lg transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Rapport seul (HTML)
            </button>
            {rapportHtml && (
              <button
                onClick={() => setPreviewRapport(true)}
                className="w-full flex items-center gap-2 border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-sm font-medium py-2 rounded-lg transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Aperçu rapport
              </button>
            )}
          </div>

          {/* Historique exports */}
          {exportsHistory.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Exports précédents</h3>
              <div className="space-y-2">
                {exportsHistory.slice(0, 5).map(exp => (
                  <div key={exp.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{new Date(exp.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={exp.status === 'ready' ? 'text-green-400' : 'text-slate-500'}>{exp.status === 'ready' ? '✓ Prêt' : exp.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLONNE PRINCIPALE */}
        <div className="col-span-2 space-y-5">

          {/* Blocages si non éligible */}
          {eligibility && !eligibility.canExport && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🚫</span>
                <div>
                  <h3 className="font-semibold text-red-300">Export bloqué</h3>
                  <p className="text-xs text-red-400/70">Corrigez les problèmes suivants avant de générer le pack.</p>
                </div>
              </div>
              <div className="space-y-2">
                {eligibility.blocks.map((block, i) => (
                  <div key={i} className="flex items-start gap-2 bg-red-500/10 rounded-lg px-3 py-2">
                    <span className="text-red-400 flex-shrink-0 mt-0.5">✗</span>
                    <span className="text-sm text-red-300">{block}</span>
                  </div>
                ))}
              </div>
              {eligibility.missingItems.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-red-400 mb-2">Pièces manquantes :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {eligibility.missingItems.map((item, i) => (
                      <span key={i} className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">{item}</span>
                    ))}
                  </div>
                </div>
              )}
              <Link href={`/projets/${project.id}/conformite`} className="inline-flex items-center gap-1.5 mt-4 text-sm text-red-400 hover:text-red-300 transition-colors">
                → Aller à la conformité pour corriger
              </Link>
            </div>
          )}

          {/* Stepper de progression */}
          {isProcessing && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
              <h3 className="font-semibold text-white mb-5">Génération en cours...</h3>
              <div className="space-y-3">
                {progressSteps.map((s, i) => {
                  const isDone = i < currentStepIdx
                  const isCurrent = i === currentStepIdx
                  return (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isDone ? 'bg-green-500' : isCurrent ? 'bg-blue-600' : 'bg-slate-700'
                      }`}>
                        {isDone ? (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        ) : isCurrent ? (
                          <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                        ) : (
                          <span className="text-xs text-slate-500">{i + 1}</span>
                        )}
                      </div>
                      <span className={`text-sm transition-colors ${isDone ? 'text-green-400' : isCurrent ? 'text-white font-medium' : 'text-slate-500'}`}>
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* État idle — carte principale */}
          {step === 'idle' && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8">
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: primaryColor + '20', border: `2px solid ${primaryColor}40` }}>
                  <span className="text-4xl">📦</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Pack candidature complet</h2>
                <p className="text-slate-400 text-sm max-w-md mx-auto">
                  Génère un fichier ZIP structuré avec toutes les pièces du dossier, prêt à être déposé sur la plateforme acheteur.
                </p>
              </div>

              {/* Structure du pack */}
              <div className="grid grid-cols-2 gap-3 mb-8">
                {[
                  { folder: '01_Candidature', icon: '👤', desc: 'DC1, DC2, attestations, assurances...' },
                  { folder: '02_Offre_Technique', icon: '📝', desc: 'Mémoire technique, annexes tech...' },
                  { folder: '03_Offre_Financiere', icon: '💶', desc: 'AE, DPGF/BPU/DQE renseigné...' },
                  { folder: '04_Annexes', icon: '📎', desc: 'Rapport conformité, certifications...' },
                ].map(f => (
                  <div key={f.folder} className="bg-slate-700/30 border border-slate-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{f.icon}</span>
                      <span className="text-xs font-mono font-bold text-slate-300">{f.folder}/</span>
                    </div>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* Bouton principal */}
              <button
                onClick={handleStartExport}
                disabled={isProcessing}
                className="w-full py-4 rounded-xl text-white font-bold text-base transition-all flex items-center justify-center gap-3"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Générer et télécharger le pack ZIP
              </button>
              <p className="text-center text-xs text-slate-500 mt-3">
                Inclut le rapport de conformité · Téléchargement automatique
              </p>
            </div>
          )}

          {/* Succès */}
          {step === 'done' && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-8 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-green-400 mb-2">Pack téléchargé !</h2>
              <p className="text-slate-400 text-sm mb-6">
                Le fichier ZIP a été téléchargé sur votre ordinateur.<br />
                Déposez-le sur la plateforme acheteur avant la DLRO.
              </p>

              {/* Résumé du manifest */}
              {manifest && (
                <div className="bg-slate-800/50 rounded-xl p-4 text-left mb-6">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Contenu du pack</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fichiers inclus</span>
                      <span className="text-white font-medium">{manifest.total_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Manquants</span>
                      <span className={manifest.missing_files?.length > 0 ? 'text-amber-400' : 'text-green-400'}>
                        {manifest.missing_files?.length ?? 0}
                      </span>
                    </div>
                  </div>
                  {manifest.missing_files?.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-amber-400">Pièces non incluses :</p>
                      {manifest.missing_files.map((f: string, i: number) => (
                        <p key={i} className="text-xs text-slate-500">• {f}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { setStep('idle'); setEligibility(null) }}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium px-5 py-2.5 rounded-lg transition-all"
                >
                  Nouvel export
                </button>
                {rapportHtml && (
                  <button
                    onClick={() => setPreviewRapport(true)}
                    className="border border-slate-600 hover:border-slate-500 text-slate-300 text-sm font-medium px-5 py-2.5 rounded-lg transition-all"
                  >
                    Voir le rapport
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
              <p className="text-4xl mb-3">⚠️</p>
              <p className="text-red-400 font-medium mb-2">Erreur lors de l'export</p>
              <p className="text-slate-500 text-sm mb-4">{error}</p>
              <button onClick={() => { setStep('idle'); setError(null) }} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg transition-all">
                Réessayer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal préview rapport */}
      {previewRapport && rapportHtml && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
            <h3 className="font-semibold text-white">Aperçu — Rapport de conformité</h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const blob = new Blob([rapportHtml], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `Rapport_conformite.html`
                  document.body.appendChild(a); a.click()
                  document.body.removeChild(a); URL.revokeObjectURL(url)
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-all"
              >
                ⬇ Télécharger
              </button>
              <button onClick={() => setPreviewRapport(false)} className="text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5">
                ✕ Fermer
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe srcDoc={rapportHtml} className="w-full h-full border-0 bg-white" title="Rapport de conformité" />
          </div>
        </div>
      )}
    </div>
  )
}
