'use client'

import { useState, useTransition } from 'react'
import { createReference, deleteReference, toggleReferenceFeatured } from '@/lib/actions/entreprise'
import type { CompanyReference } from '@/types/entreprise'

interface Props {
  references: CompanyReference[]
  stats: { totalAmount: number; publicCount: number; privateCount: number }
}

export function ReferencesClient({ references, stats }: Props) {
  const [modal, setModal] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = references.filter(r =>
    search === '' ||
    r.client_name.toLowerCase().includes(search.toLowerCase()) ||
    r.project_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )

  async function handleCreate(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createReference(formData)
      if (result?.error) setError(result.error)
      else setModal(false)
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette référence ?')) return
    startTransition(async () => { await deleteReference(id) })
  }

  async function handleToggleFeatured(id: string, current: boolean) {
    startTransition(async () => { await toggleReferenceFeatured(id, !current) })
  }

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total références" value={references.length.toString()} icon="📋" />
        <StatCard label="Marché public / privé" value={`${stats.publicCount} / ${stats.privateCount}`} icon="🏛️" />
        <StatCard label="Volume total" value={stats.totalAmount > 0 ? fmt(stats.totalAmount) : '—'} icon="💶" />
      </div>

      {/* Barre actions */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par client, projet, tag..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-9 pr-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter une référence
        </button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
          {references.length === 0 ? (
            <>
              <p className="text-slate-400 font-medium mb-1">Aucune référence</p>
              <p className="text-slate-500 text-sm mb-4">Vos références chantiers sont votre meilleur atout pour convaincre les acheteurs publics.</p>
              <button onClick={() => setModal(true)} className="text-blue-400 hover:text-blue-300 text-sm font-medium">+ Ajouter votre première référence</button>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Aucun résultat pour "{search}"</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ref => (
            <div
              key={ref.id}
              className={`bg-slate-800/50 border rounded-xl p-5 group transition-all ${
                ref.is_featured ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-white text-sm">{ref.client_name}</h3>
                    {ref.client_type && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        ref.client_type === 'Public'
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/20'
                          : 'bg-purple-600/20 text-purple-300 border border-purple-500/20'
                      }`}>{ref.client_type}</span>
                    )}
                    {ref.is_featured && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300 border border-amber-500/20">⭐ Mis en avant</span>
                    )}
                  </div>
                  {ref.project_name && <p className="text-sm text-slate-300">{ref.project_name}</p>}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {ref.location && <span className="text-xs text-slate-500">📍 {ref.location}</span>}
                    {(ref.start_date || ref.end_date) && (
                      <span className="text-xs text-slate-500">
                        📅 {ref.start_date ? new Date(ref.start_date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' }) : ''}
                        {ref.end_date ? ` → ${new Date(ref.end_date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}` : ''}
                      </span>
                    )}
                    {ref.amount && <span className="text-xs text-green-400 font-medium">💶 {fmt(ref.amount)}</span>}
                    {ref.role && <span className="text-xs text-slate-500">Rôle : {ref.role}</span>}
                  </div>
                  {ref.description && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{ref.description}</p>}
                  {ref.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ref.tags.map(t => (
                        <span key={t} className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggleFeatured(ref.id, ref.is_featured)}
                    title={ref.is_featured ? 'Retirer la mise en avant' : 'Mettre en avant'}
                    className={`p-1.5 rounded-lg transition-colors ${ref.is_featured ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-amber-400'}`}
                  >
                    <svg className="w-4 h-4" fill={ref.is_featured ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(ref.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal ajout */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="font-semibold text-white">Nouvelle référence marché</h3>
              <button onClick={() => setModal(false)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(new FormData(e.currentTarget)) }} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <F label="Client" required><input name="client_name" required className={inp} placeholder="Mairie de Lyon" /></F>
                <F label="Type de client">
                  <select name="client_type" className={inp}>
                    <option value="">Sélectionner</option>
                    <option value="Public">Public</option>
                    <option value="Privé">Privé</option>
                  </select>
                </F>
              </div>
              <F label="Nom du projet"><input name="project_name" className={inp} placeholder="Réfection voirie centre-ville" /></F>
              <F label="Description"><textarea name="description" className={`${inp} resize-none`} rows={3} placeholder="Description des travaux réalisés..." /></F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Localisation"><input name="location" className={inp} placeholder="Lyon 69" /></F>
                <F label="Montant (€ HT)"><input name="amount" type="number" min="0" className={inp} placeholder="150000" /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Début"><input name="start_date" type="date" className={inp} /></F>
                <F label="Fin"><input name="end_date" type="date" className={inp} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Rôle">
                  <select name="role" className={inp}>
                    <option value="">Sélectionner</option>
                    <option value="Mandataire">Mandataire</option>
                    <option value="Co-traitant">Co-traitant</option>
                    <option value="Sous-traitant">Sous-traitant</option>
                    <option value="Titulaire seul">Titulaire seul</option>
                  </select>
                </F>
                <F label="Tags (séparés par virgule)"><input name="tags" className={inp} placeholder="VRD, Terrassement..." /></F>
              </div>
              <F label="Contact client (nom)"><input name="contact_name" className={inp} placeholder="Marie Martin" /></F>
              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" name="is_featured" value="true" id="featured" className="rounded" />
                <label htmlFor="featured" className="text-sm text-slate-400">⭐ Mettre en avant dans les mémoires</label>
              </div>
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
                <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-all">
                  {isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
      <span className="text-xl">{icon}</span>
      <p className="text-xl font-bold text-white mt-2">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function F({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label} {required && <span className="text-red-400">*</span>}</label>
      {children}
    </div>
  )
}

const inp = `w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`
