'use client'

import { useState, useTransition } from 'react'
import { updateCompanyIdentite } from '@/lib/actions/entreprise'
import type { AuthUser } from '@/types/database'

interface Props { company: any; user: AuthUser }

const PLANS = [
  { id: 'starter', name: 'Starter', price: '99€/mois', features: ['5 projets actifs', '2 utilisateurs', 'Analyse DCE', 'Export pack'] },
  { id: 'pro',     name: 'Pro',     price: '299€/mois', features: ['Projets illimités', '10 utilisateurs', 'Tous modules', 'Chatbot RAG', 'Support prioritaire'], recommended: true },
  { id: 'enterprise', name: 'Enterprise', price: 'Sur devis', features: ['Multi-entreprises', 'Utilisateurs illimités', 'API access', 'SLA garanti', 'Formation'] },
]

export function ParametresClient({ company, user }: Props) {
  const [activeTab, setActiveTab] = useState<'branding' | 'abonnement' | 'profil' | 'securite'>('branding')
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [primaryColor, setPrimaryColor] = useState(company.primary_color ?? '#1a56db')
  const [secondaryColor, setSecondaryColor] = useState(company.secondary_color ?? '#7e3af2')

  async function handleSaveBranding(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      await updateCompanyIdentite(fd)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">⚙️ Paramètres</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700/50 mb-6">
        {[
          { id: 'branding', label: '🎨 Branding' },
          { id: 'abonnement', label: '💳 Abonnement' },
          { id: 'profil', label: '👤 Mon profil' },
          { id: 'securite', label: '🔒 Sécurité' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${activeTab === tab.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* BRANDING */}
      {activeTab === 'branding' && (
        <div className="max-w-lg">
          <p className="text-sm text-slate-400 mb-5">Configurez l'identité visuelle appliquée à tous vos mémoires, rapports et exports.</p>
          <form onSubmit={handleSaveBranding} className="space-y-5">
            {/* Caché : valeurs existantes */}
            <input type="hidden" name="name" value={company.name} />
            <input type="hidden" name="siret" value={company.siret ?? ''} />

            {/* Logo */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Logo entreprise</h3>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-700 border border-slate-600 rounded-xl flex items-center justify-center">
                  {company.logo_url
                    ? <img src={company.logo_url} alt="Logo" className="w-full h-full object-contain rounded-xl" />
                    : <span className="text-2xl">{company.name?.[0]?.toUpperCase() ?? '?'}</span>}
                </div>
                <div>
                  <button type="button" className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all">
                    Changer le logo
                  </button>
                  <p className="text-[10px] text-slate-500 mt-1">PNG ou SVG recommandé · fond transparent</p>
                </div>
              </div>
            </div>

            {/* Couleurs */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Couleurs de la charte</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Couleur primaire</label>
                  <div className="flex items-center gap-2">
                    <input type="color" name="primary_color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Couleur secondaire</label>
                  <div className="flex items-center gap-2">
                    <input type="color" name="secondary_color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                    <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none" />
                  </div>
                </div>
              </div>
              {/* Aperçu */}
              <div className="mt-4 p-4 rounded-lg border border-slate-600 bg-slate-900/50">
                <p className="text-xs text-slate-500 mb-2">Aperçu</p>
                <div className="flex items-center gap-3">
                  <div className="h-6 w-20 rounded" style={{ background: primaryColor }} />
                  <div className="h-6 w-20 rounded" style={{ background: secondaryColor }} />
                  <span className="text-sm font-semibold" style={{ color: primaryColor }}>{company.name}</span>
                </div>
              </div>
            </div>

            <button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-all">
              {saved ? '✓ Sauvegardé' : isPending ? 'Sauvegarde...' : 'Enregistrer les modifications'}
            </button>
          </form>
        </div>
      )}

      {/* ABONNEMENT */}
      {activeTab === 'abonnement' && (
        <div>
          <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Formule actuelle : <span className="capitalize">{company.subscription_plan}</span></p>
              <p className="text-xs text-slate-400 mt-0.5">Statut : <span className={company.subscription_status === 'active' ? 'text-green-400' : company.subscription_status === 'trial' ? 'text-amber-400' : 'text-red-400'}>{company.subscription_status}</span></p>
            </div>
            {company.subscription_status === 'trial' && company.trial_ends_at && (
              <p className="text-sm text-amber-400 font-medium">
                Essai — {Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86400000))} j restants
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-5">
            {PLANS.map(plan => (
              <div key={plan.id} className={`border rounded-xl p-5 transition-all ${plan.recommended ? 'border-blue-500/50 bg-blue-600/5' : 'border-slate-700/50 bg-slate-800/40'}`}>
                {plan.recommended && <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium mb-2 inline-block">Recommandé</span>}
                <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                <p className="text-2xl font-bold mt-1 mb-4" style={{ color: plan.recommended ? '#3b82f6' : '#fff' }}>{plan.price}</p>
                <ul className="space-y-1.5 mb-5">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                      <svg className="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                  company.subscription_plan === plan.id
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30 cursor-default'
                    : plan.recommended
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}>
                  {company.subscription_plan === plan.id ? '✓ Formule actuelle' : plan.id === 'enterprise' ? 'Nous contacter' : 'Choisir'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROFIL */}
      {activeTab === 'profil' && (
        <div className="max-w-lg space-y-5">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Informations personnelles</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-slate-400 mb-1">Nom complet</label>
                <input defaultValue={user.profile.full_name} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Email</label>
                <input defaultValue={user.email} disabled className="w-full bg-slate-700/50 border border-slate-700 text-slate-400 rounded-lg px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-xs text-slate-400 mb-1">Rôle</label>
                <input defaultValue={user.profile.role} disabled className="w-full bg-slate-700/50 border border-slate-700 text-slate-400 rounded-lg px-3 py-2.5 text-sm" /></div>
            </div>
            <button className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">Mettre à jour</button>
          </div>
        </div>
      )}

      {/* SÉCURITÉ */}
      {activeTab === 'securite' && (
        <div className="max-w-lg space-y-5">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Mot de passe</h3>
            <p className="text-xs text-slate-500 mb-4">Modifiez votre mot de passe de connexion.</p>
            <button className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
              Changer le mot de passe
            </button>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Authentification à deux facteurs</h3>
            <p className="text-xs text-slate-500 mb-4">Renforcez la sécurité de votre compte avec un second facteur.</p>
            <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
              Activer le MFA
            </button>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Journal d'audit</h3>
            <p className="text-xs text-slate-500 mb-4">Consultez toutes les actions réalisées sur votre compte.</p>
            <a href="/parametres/audit" className="inline-block bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
              Voir le journal
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
