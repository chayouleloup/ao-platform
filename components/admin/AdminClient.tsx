'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  companies: any[]
  stats: { companies: number; users: number; projects: number }
}

export function AdminClient({ companies, stats }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any | null>(null)

  const filtered = companies.filter(c =>
    search === '' ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.siret?.includes(search)
  )

  const fmtEur = (n: number) => n ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) : '—'
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-red-600/20 border border-red-500/30 rounded-lg flex items-center justify-center">
            <span className="text-red-400 text-sm">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Administration — LS Consulting</h1>
        </div>
        <p className="text-slate-400 text-sm">Vue complète de tous les comptes et dossiers entreprises.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Entreprises', value: stats.companies, icon: '🏢', color: 'text-blue-400' },
          { label: 'Utilisateurs', value: stats.users, icon: '👥', color: 'text-green-400' },
          { label: 'Projets AO', value: stats.projects, icon: '📁', color: 'text-purple-400' },
        ].map(k => (
          <div key={k.label} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <span className="text-2xl">{k.icon}</span>
            <p className={`text-3xl font-bold mt-2 ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* LISTE ENTREPRISES */}
        <div className="col-span-1 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-white">Entreprises ({filtered.length})</h2>
          </div>

          {/* Recherche */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Liste */}
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {filtered.map(company => {
              const users = company.profiles ?? []
              const lastLogin = users
                .filter((u: any) => u.last_login_at)
                .sort((a: any, b: any) => new Date(b.last_login_at).getTime() - new Date(a.last_login_at).getTime())[0]

              return (
                <button
                  key={company.id}
                  onClick={() => setSelected(company)}
                  className={`w-full text-left px-3 py-3 rounded-xl transition-all border ${
                    selected?.id === company.id
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{company.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 ${
                      company.subscription_status === 'active' ? 'bg-green-500/20 text-green-400' :
                      company.subscription_status === 'trial' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-700 text-slate-500'
                    }`}>{company.subscription_status}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{users.length} utilisateur{users.length > 1 ? 's' : ''}</span>
                    {lastLogin && <span>· Dernière connexion {fmtDate(lastLogin.last_login_at)}</span>}
                  </div>
                </button>
              )
            })}

            {filtered.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">Aucune entreprise trouvée</p>
            )}
          </div>
        </div>

        {/* DÉTAIL ENTREPRISE */}
        <div className="col-span-2">
          {!selected ? (
            <div className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
              <p className="text-4xl mb-3">👆</p>
              <p className="text-slate-400 text-sm">Sélectionnez une entreprise pour voir son dossier complet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header entreprise */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {selected.siret && `SIRET : ${selected.siret}`}
                      {selected.legal_form && ` · ${selected.legal_form}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      selected.subscription_plan === 'pro' ? 'bg-blue-500/20 text-blue-400' :
                      selected.subscription_plan === 'enterprise' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-slate-700 text-slate-400'
                    }`}>{selected.subscription_plan}</span>
                    <p className="text-xs text-slate-500 mt-1">Créé le {fmtDate(selected.created_at)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Adresse', value: [selected.address, selected.postal_code, selected.city].filter(Boolean).join(', ') || null },
                    { label: 'CA N-1', value: selected.revenue_n1 ? fmtEur(selected.revenue_n1) : null },
                    { label: 'Interlocuteur AO', value: selected.ao_contact_name ?? null },
                    { label: 'Email AO', value: selected.ao_contact_email ?? null },
                    { label: 'Téléphone AO', value: selected.ao_contact_phone ?? null },
                    { label: 'TVA', value: selected.tva_number ?? null },
                  ].map(f => f.value && (
                    <div key={f.label}>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{f.label}</p>
                      <p className="text-sm text-white mt-0.5">{f.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Utilisateurs */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">
                  👥 Utilisateurs ({(selected.profiles ?? []).length})
                </h3>
                <div className="space-y-2">
                  {(selected.profiles ?? []).map((profile: any) => {
                    const initials = profile.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                    const roleColors: Record<string, string> = {
                      admin_entreprise: 'text-blue-400 bg-blue-500/10',
                      utilisateur: 'text-green-400 bg-green-500/10',
                      relecteur: 'text-amber-400 bg-amber-500/10',
                      finance: 'text-cyan-400 bg-cyan-500/10',
                    }
                    return (
                      <div key={profile.id} className="flex items-center gap-3 p-3 bg-slate-900/40 rounded-lg">
                        <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-slate-300">{initials}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{profile.full_name}</p>
                          <p className="text-xs text-slate-500">
                            {profile.last_login_at ? `Dernière connexion ${fmtDate(profile.last_login_at)}` : 'Jamais connecté'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${roleColors[profile.role] ?? 'text-slate-400 bg-slate-700'}`}>
                            {profile.role}
                          </span>
                          <div className={`w-2 h-2 rounded-full ${profile.is_active ? 'bg-green-400' : 'bg-slate-600'}`} />
                        </div>
                      </div>
                    )
                  })}
                  {!(selected.profiles ?? []).length && (
                    <p className="text-slate-500 text-sm text-center py-2">Aucun utilisateur</p>
                  )}
                </div>
              </div>

              {/* Abonnement */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">💳 Abonnement</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Plan</p>
                    <p className="text-sm font-medium text-white capitalize mt-0.5">{selected.subscription_plan}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase">Statut</p>
                    <p className={`text-sm font-medium mt-0.5 ${
                      selected.subscription_status === 'active' ? 'text-green-400' :
                      selected.subscription_status === 'trial' ? 'text-amber-400' : 'text-red-400'
                    }`}>{selected.subscription_status}</p>
                  </div>
                  {selected.trial_ends_at && (
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase">Fin d'essai</p>
                      <p className="text-sm text-white mt-0.5">{fmtDate(selected.trial_ends_at)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
