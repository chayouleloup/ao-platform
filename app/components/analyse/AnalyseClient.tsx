'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { launchDceAnalysis, relaunchAnalysis } from '@/lib/actions/analyse-dce'
import { FicheSynthese } from './FicheSynthese'
import { DCE_DOC_TYPE_CONFIG } from '@/types/projet'

interface Props {
  project: any
  lots: any[]
  versions: any[]
  documents: any[]
  extractions: any[]
  currentVersionId: string | null
}

export function AnalyseClient({ project, lots, versions, documents, extractions, currentVersionId }: Props) {
  const [selectedLotId, setSelectedLotId] = useState<string>(lots[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [launchSuccess, setLaunchSuccess] = useState(false)

  const currentExtraction = extractions.find(e => e.lot_id === selectedLotId)
  const extractionStatus = currentExtraction?.extraction_status ?? 'none'
  const isRunning = extractionStatus === 'running' || isPending
  const isDone = extractionStatus === 'done'
  const isError = extractionStatus === 'error'

  // Vérifier la présence du RC
  const hasRC = documents.some(d => d.doc_type === 'RC')
  const hasDocuments = documents.length > 0

  // Stats des documents
  const docsByType = documents.reduce((acc: Record<string, number>, d: any) => {
    acc[d.doc_type] = (acc[d.doc_type] ?? 0) + 1
    return acc
  }, {})

  async function handleLaunch() {
    if (!currentVersionId || !selectedLotId) return
    setError(null)
    setLaunchSuccess(false)

    startTransition(async () => {
      const result = isError
        ? await relaunchAnalysis(project.id, selectedLotId, currentVersionId)
        : await launchDceAnalysis(project.id, selectedLotId, currentVersionId)

      if (result?.error) setError(result.error)
      else setLaunchSuccess(true)
    })
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {project.title}
        </Link>
        <h1 className="text-2xl font-bold text-white">🔍 Analyse DCE</h1>
        <p className="text-slate-400 text-sm mt-1">
          L'IA analyse les documents RC/CCAP/CCTP et extrait toutes les informations clés.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* COLONNE GAUCHE — Configuration + statut */}
        <div className="space-y-4">

          {/* Sélection du lot */}
          {lots.length > 1 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Lot à analyser</h3>
              <div className="space-y-1.5">
                {lots.map((lot: any) => {
                  const lotExtraction = extractions.find(e => e.lot_id === lot.id)
                  return (
                    <button
                      key={lot.id}
                      onClick={() => setSelectedLotId(lot.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                        selectedLotId === lot.id
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                          : 'text-slate-400 hover:bg-slate-700/50 border border-transparent'
                      }`}
                    >
                      <span>Lot {lot.number} — {lot.title}</span>
                      {lotExtraction?.extraction_status === 'done' && <span className="text-green-400 text-xs">✓</span>}
                      {lotExtraction?.extraction_status === 'running' && <span className="text-blue-400 text-xs">⟳</span>}
                      {lotExtraction?.extraction_status === 'error' && <span className="text-red-400 text-xs">✗</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Documents disponibles */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
              Documents DCE
              {versions[0] && <span className="ml-1 text-slate-600">v{versions[0].version}</span>}
            </h3>

            {!hasDocuments ? (
              <div className="text-center py-4">
                <p className="text-xs text-slate-500 mb-2">Aucun document importé</p>
                <Link
                  href={`/projets/${project.id}`}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  → Importer le DCE
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(docsByType).sort(([a], [b]) => {
                  const pa = DCE_DOC_TYPE_CONFIG[a as keyof typeof DCE_DOC_TYPE_CONFIG]?.priority ?? 99
                  const pb = DCE_DOC_TYPE_CONFIG[b as keyof typeof DCE_DOC_TYPE_CONFIG]?.priority ?? 99
                  return pa - pb
                }).map(([type, count]) => {
                  const cfg = DCE_DOC_TYPE_CONFIG[type as keyof typeof DCE_DOC_TYPE_CONFIG]
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg?.color ?? 'text-slate-400 bg-slate-700 border-slate-600'}`}>
                        {cfg?.label ?? type}
                      </span>
                      <span className="text-xs text-slate-500">× {count}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {!hasRC && hasDocuments && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-400">⚠️ Pas de RC identifié — l'analyse sera moins précise</p>
              </div>
            )}
          </div>

          {/* Lancer l'analyse */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Analyse IA</h3>

            {!hasDocuments ? (
              <p className="text-xs text-slate-500">Importez d'abord le DCE.</p>
            ) : (
              <>
                {/* Statut */}
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-medium ${
                  isRunning ? 'bg-blue-600/10 text-blue-300' :
                  isDone ? 'bg-green-500/10 text-green-300' :
                  isError ? 'bg-red-500/10 text-red-300' :
                  'bg-slate-700/50 text-slate-400'
                }`}>
                  {isRunning && <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {isDone && <span>✓</span>}
                  {isError && <span>✗</span>}
                  {extractionStatus === 'none' && <span>○</span>}
                  <span>
                    {isRunning ? 'Analyse en cours...' :
                     isDone ? `Analyse terminée · ${new Date(currentExtraction.extracted_at).toLocaleDateString('fr-FR')}` :
                     isError ? 'Erreur lors de l\'analyse' :
                     'En attente'}
                  </span>
                </div>

                {isError && currentExtraction?.error_message && (
                  <p className="text-xs text-red-400 mb-3 bg-red-500/10 rounded px-2 py-1.5">
                    {currentExtraction.error_message}
                  </p>
                )}

                {error && (
                  <p className="text-xs text-red-400 mb-3 bg-red-500/10 rounded px-2 py-1.5">{error}</p>
                )}

                {launchSuccess && !isDone && (
                  <p className="text-xs text-green-400 mb-3">✓ Analyse lancée — rechargez la page dans quelques instants</p>
                )}

                <button
                  onClick={handleLaunch}
                  disabled={isRunning || !selectedLotId || !currentVersionId}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    isDone
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Analyse en cours...
                    </>
                  ) : isDone ? '↺ Relancer l\'analyse' : '▶ Lancer l\'analyse IA'}
                </button>

                <p className="text-[10px] text-slate-600 mt-2 text-center">
                  Extrait DLRO · visite · critères · pièces · contraintes
                </p>
              </>
            )}
          </div>
        </div>

        {/* COLONNE DROITE — Résultats */}
        <div className="col-span-2">
          {!isDone ? (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-16 text-center">
              {isRunning ? (
                <>
                  <div className="w-16 h-16 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
                  <p className="text-white font-medium mb-2">Analyse IA en cours...</p>
                  <p className="text-slate-400 text-sm">
                    Claude lit le RC et extrait les informations clés du marché.
                  </p>
                  <div className="mt-6 space-y-2 text-left max-w-xs mx-auto">
                    {['Extraction du texte des documents', 'Analyse RC (source prioritaire)', 'Extraction critères et pondérations', 'Identification des pièces à fournir', 'Détection des points de vigilance'].map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
                        <svg className="animate-spin w-3 h-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        {step}
                      </div>
                    ))}
                  </div>
                </>
              ) : isError ? (
                <>
                  <p className="text-4xl mb-3">⚠️</p>
                  <p className="text-white font-medium mb-2">L'analyse a rencontré une erreur</p>
                  <p className="text-slate-400 text-sm mb-4">{currentExtraction?.error_message}</p>
                  <button onClick={handleLaunch} disabled={isPending} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
                    ↺ Relancer
                  </button>
                </>
              ) : (
                <>
                  <p className="text-4xl mb-3">🔍</p>
                  <p className="text-white font-medium mb-2">Prêt à analyser</p>
                  <p className="text-slate-400 text-sm mb-4">
                    {hasDocuments
                      ? `${documents.length} document${documents.length > 1 ? 's' : ''} importé${documents.length > 1 ? 's' : ''} · cliquez sur "Lancer l'analyse IA"`
                      : 'Importez d\'abord le DCE dans l\'onglet DCE du projet.'}
                  </p>
                  {hasDocuments && (
                    <button onClick={handleLaunch} disabled={isPending || !selectedLotId || !currentVersionId} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
                      ▶ Lancer l'analyse IA
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-white">
                  Fiche synthèse —{' '}
                  {lots.length > 1
                    ? `Lot ${lots.find((l: any) => l.id === selectedLotId)?.number} · ${lots.find((l: any) => l.id === selectedLotId)?.title}`
                    : 'Marché unique'}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-full font-medium">
                    ✓ Analyse complète
                  </span>
                  <button
                    onClick={handleLaunch}
                    disabled={isPending}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    title="Relancer l'analyse"
                  >
                    ↺
                  </button>
                </div>
              </div>

              <FicheSynthese
                extraction={currentExtraction}
                lots={lots}
                lotId={selectedLotId}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
