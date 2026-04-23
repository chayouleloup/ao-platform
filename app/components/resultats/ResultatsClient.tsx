'use client'

import { useState, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createResultat, analyzeResultatPdf } from '@/lib/actions/resultats'

interface Props { resultats: any[]; projects: any[]; kpis: any }

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  gagne:       { label: 'Gagné',        color: 'text-green-400',  bg: 'bg-green-500/10',  icon: '🏆' },
  perdu:       { label: 'Non retenu',   color: 'text-red-400',    bg: 'bg-red-500/10',    icon: '❌' },
  infructueux: { label: 'Infructueux',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  icon: '⚠️' },
  sans_suite:  { label: 'Sans suite',   color: 'text-slate-400',  bg: 'bg-slate-700/30',  icon: '○' },
}

export function ResultatsClient({ resultats: initialResultats, projects, kpis }: Props) {
  const [resultats, setResultats] = useState(initialResultats)
  const [uploadModal, setUploadModal] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')
  const [selectedLotId, setSelectedLotId] = useState(projects[0]?.lots?.[0]?.id ?? '')
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [activeResultat, setActiveResultat] = useState<any | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  async function handleUpload(file: File) {
    const supabase = createClient()
    const path = `${selectedProjectId}/resultats/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('company-documents').upload(path, file)
    if (error) return

    const { data: { publicUrl } } = supabase.storage.from('company-documents').getPublicUrl(path)
    const result = await createResultat({ projectId: selectedProjectId, lotId: selectedLotId, pdfUrl: publicUrl, pdfName: file.name })
    if (result?.id) {
      setUploadModal(false)
      setAnalyzing(result.id)
      const analysis = await analyzeResultatPdf(result.id)
      setAnalyzing(null)
      if (analysis?.success) {
        // Recharger
        window.location.reload()
      }
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">📊 Résultats & Notation</h1>
          <p className="text-slate-400 text-sm mt-1">Importez les notifications acheteurs — l'IA extrait notes et recommandations.</p>
        </div>
        <button onClick={() => setUploadModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Importer une notification
        </button>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'AO analysés', value: kpis.total, color: 'text-white', icon: '📋' },
            { label: 'Marchés gagnés', value: kpis.gagnes, color: 'text-green-400', icon: '🏆' },
            { label: 'Taux de succès', value: `${kpis.taux}%`, color: kpis.taux >= 50 ? 'text-green-400' : 'text-amber-400', icon: '📈' },
            { label: 'Note moyenne', value: `${kpis.note_moyenne}/100`, color: 'text-blue-400', icon: '⭐' },
          ].map(k => (
            <div key={k.label} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <span className="text-2xl">{k.icon}</span>
              <p className={`text-3xl font-bold mt-2 ${k.color}`}>{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top causes de perte */}
      {kpis?.top_pertes?.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-white text-sm mb-4">📉 Top causes de perte de points</h3>
          <div className="space-y-2">
            {kpis.top_pertes.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-48 truncate">{p.critere}</span>
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.min(p.perte_moy, 100)}%` }} />
                </div>
                <span className="text-xs text-red-400 w-16 text-right">-{p.perte_moy}% moy.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des résultats */}
      {resultats.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-16 text-center">
          <p className="text-4xl mb-3">📬</p>
          <p className="text-white font-medium mb-1">Aucune notification importée</p>
          <p className="text-slate-400 text-sm mb-4">Importez les courriers de notification acheteurs pour analyser vos résultats et progresser.</p>
          <button onClick={() => setUploadModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
            Importer ma première notification
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {resultats.map(r => {
            const cfg = STATUS_CONFIG[r.result_status ?? 'sans_suite'] ?? STATUS_CONFIG.sans_suite
            return (
              <div
                key={r.id}
                className={`border rounded-xl p-5 cursor-pointer transition-all hover:border-slate-600 ${analyzing === r.id ? 'bg-blue-500/5 border-blue-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}
                onClick={() => setActiveResultat(activeResultat?.id === r.id ? null : r)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-lg">{cfg.icon}</span>
                      <h3 className="font-semibold text-white">{(r as any).projects?.title ?? r.project_id}</h3>
                      {r.lots && <span className="text-xs text-slate-400">Lot {(r as any).lots?.number}</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      {r.notification_date && <span className="text-xs text-slate-500">📅 {new Date(r.notification_date).toLocaleDateString('fr-FR')}</span>}
                      {r.attributaire && <span className="text-xs text-slate-500">Titulaire : {r.attributaire}</span>}
                      {analyzing === r.id && <span className="text-xs text-blue-400 flex items-center gap-1"><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Analyse IA...</span>}
                    </div>
                  </div>
                  {r.note_globale !== null && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-bold text-white">{r.note_globale}<span className="text-sm text-slate-400">/{r.note_max}</span></p>
                      <p className="text-xs text-slate-500">Note globale</p>
                    </div>
                  )}
                </div>

                {/* Détail dépliable */}
                {activeResultat?.id === r.id && r.extraction_status === 'done' && (
                  <div className="mt-5 pt-5 border-t border-slate-700/50 space-y-5">
                    {/* Notes par critère */}
                    {(r.notes_by_critere ?? []).length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Notes par critère</h4>
                        <div className="space-y-2">
                          {r.notes_by_critere.map((n: any, i: number) => (
                            <div key={i} className="bg-slate-900/50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-white">{n.critere}</span>
                                <span className={`text-sm font-bold ${(n.note / n.note_max) >= 0.7 ? 'text-green-400' : (n.note / n.note_max) >= 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
                                  {n.note}/{n.note_max}
                                </span>
                              </div>
                              <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1">
                                <div className={`h-1.5 rounded-full ${(n.note / n.note_max) >= 0.7 ? 'bg-green-500' : (n.note / n.note_max) >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${(n.note / n.note_max) * 100}%` }} />
                              </div>
                              {n.commentaire && <p className="text-xs text-slate-400 italic">"{n.commentaire}"</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommandations */}
                    {(r.recommandations ?? []).length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">💡 Recommandations actionnables</h4>
                        <div className="space-y-2">
                          {r.recommandations.map((rec: any, i: number) => (
                            <div key={i} className={`border rounded-lg p-3 ${rec.priorite === 1 ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/50 border-slate-700/50'}`}>
                              <div className="flex items-start gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${rec.priorite === 1 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>P{rec.priorite}</span>
                                <div>
                                  <p className="text-sm font-medium text-white">{rec.action}</p>
                                  {rec.detail && <p className="text-xs text-slate-400 mt-0.5">{rec.detail}</p>}
                                  <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded mt-1 inline-block">{rec.type}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal upload */}
      {uploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-white mb-4">Importer une notification</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Projet</label>
                <select value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); const p = projects.find((p: any) => p.id === e.target.value); setSelectedLotId(p?.lots?.[0]?.id ?? '') }} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              {selectedProject?.lots?.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Lot</label>
                  <select value={selectedLotId} onChange={e => setSelectedLotId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                    {selectedProject.lots.map((l: any) => <option key={l.id} value={l.id}>Lot {l.number} — {l.title}</option>)}
                  </select>
                </div>
              )}
              <div
                className="border-2 border-dashed border-slate-600 hover:border-blue-500/50 rounded-xl p-8 text-center cursor-pointer transition-all"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
              >
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
                <p className="text-2xl mb-2">📄</p>
                <p className="text-sm text-slate-400">Glissez le PDF de notification</p>
                <p className="text-xs text-slate-600 mt-1">Courrier, rapport d'analyse, grille de notes...</p>
              </div>
              <button onClick={() => setUploadModal(false)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
