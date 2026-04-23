'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { searchAOs, saveSourcingProfile, createProjectFromSourcing } from '@/lib/actions/admin-sourcing'

export default function SourcingPage() {
  const router = useRouter()
  const [keywords, setKeywords] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [isPending, startTransition] = useTransition()
  const [showAlert, setShowAlert] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)

  function handleSearch() {
    startTransition(async () => {
      const r = await searchAOs({ keywords })
      setResults(r.results ?? [])
    })
  }

  async function handleCreateProject(ao: any) {
    setCreating(ao.title)
    const r = await createProjectFromSourcing({ title: ao.title, buyerName: ao.buyer_name, location: ao.location, dlro: ao.dlro, sourceUrl: ao.source_url })
    setCreating(null)
    if (r.projectId) router.push(`/projets/${r.projectId}`)
  }

  const fmtEur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">🔎 Sourcing AO</h1>
          <p className="text-slate-400 text-sm mt-1">Recherchez des appels d'offres et configurez des alertes automatiques.</p>
        </div>
        <button onClick={() => setShowAlert(true)} className="flex items-center gap-2 border border-slate-600 hover:border-slate-500 text-slate-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
          🔔 Créer une alerte
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 mb-6">
        <div className="flex gap-3">
          <input
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Mots-clés (ex: voirie, rénovation, informatique...)"
            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <button onClick={handleSearch} disabled={isPending} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-all flex items-center gap-2">
            {isPending ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : '🔍'}
            Rechercher
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">ℹ️ En production : connecté aux API BOAMP, PLACE, et agrégateurs. Mode démo : exemples générés.</p>
      </div>

      {/* Résultats */}
      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{results.length} résultat{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}</p>
          {results.map((ao, i) => {
            const dlroDiff = ao.dlro ? Math.ceil((new Date(ao.dlro).getTime() - Date.now()) / 86400000) : null
            return (
              <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">{ao.title}</h3>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
                      {ao.buyer_name && <span>🏛️ {ao.buyer_name}</span>}
                      {ao.location && <span>📍 {ao.location}</span>}
                      {ao.estimated_amount && <span>💶 {fmtEur(ao.estimated_amount)}</span>}
                      {ao.cpv && <span className="bg-slate-700 px-2 py-0.5 rounded font-mono">CPV {ao.cpv}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {dlroDiff !== null && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${dlroDiff <= 7 ? 'bg-red-500/20 text-red-300' : dlroDiff <= 30 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                        J-{dlroDiff}
                      </span>
                    )}
                    <div className="flex gap-2">
                      {ao.source_url && (
                        <a href={ao.source_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Voir l'annonce →</a>
                      )}
                      <button
                        onClick={() => handleCreateProject(ao)}
                        disabled={creating === ao.title}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                      >
                        {creating === ao.title ? '...' : '+ Créer projet'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {results.length === 0 && !isPending && (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-4xl mb-3">🔎</p>
          <p className="text-white font-medium mb-1">Recherchez des appels d'offres</p>
          <p className="text-slate-400 text-sm">Entrez des mots-clés pour trouver des AO correspondant à votre activité.</p>
        </div>
      )}

      {/* Modal alerte */}
      {showAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-white mb-4">Créer une alerte AO</h3>
            <form action={async (fd) => { await saveSourcingProfile(fd); setShowAlert(false) }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nom du profil *</label>
                <input name="name" required className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="Ex: Travaux VRD Île-de-France" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Mots-clés (séparés par virgule)</label>
                <input name="keywords" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="voirie, terrassement, VRD" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Départements (ex: 75, 92, 93)</label>
                <input name="departments" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none" placeholder="75, 77, 78, 91, 92, 93, 94, 95" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Fréquence des alertes</label>
                <select name="alert_freq" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="immediate">Immédiate</option>
                  <option value="daily" selected>Quotidienne</option>
                  <option value="weekly">Hebdomadaire</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAlert(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 text-sm font-medium transition-all">Enregistrer l'alerte</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
