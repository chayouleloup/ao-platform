'use client'

import { useState } from 'react'
import Link from 'next/link'
import { registerAction } from '@/lib/actions/auth'

export default function RegisterPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [siret, setSiret] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    if (!companyName.trim()) { setError('Veuillez saisir le nom de votre entreprise'); return }
    setError(null)
    setStep(2)
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !email.trim() || !password.trim()) { setError('Veuillez remplir tous les champs'); return }
    if (password.length < 8) { setError('Le mot de passe doit faire au moins 8 caractères'); return }
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('company_name', companyName)
      fd.append('siret', siret)
      fd.append('full_name', fullName)
      fd.append('email', email)
      fd.append('password', password)
      const result = await registerAction(fd)
      if (result?.error) { setError(result.error) } else { setSuccess(true) }
    } catch (err: any) {
      setError(err.message ?? 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Compte créé !</h2>
          <p className="text-slate-400 mb-6">Votre espace est prêt.</p>
          <Link href="/auth/login" className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 px-6 text-sm transition-all">Se connecter →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <span className="text-2xl font-bold text-white">LS Consulting Plateforme</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          {step === 1 && (
            <form onSubmit={handleStep1}>
              <h2 className="text-lg font-semibold text-white mb-5">Étape 1 — Votre entreprise</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Raison sociale *</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="ACME Travaux SAS" />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">SIRET (optionnel)</label>
                <input type="text" value={siret} onChange={e => setSiret(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="12345678901234" />
              </div>
              {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3"><p className="text-sm text-red-400">{error}</p></div>}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 text-sm transition-all">Continuer →</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2}>
              <h2 className="text-lg font-semibold text-white mb-5">Étape 2 — Votre compte</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nom complet *</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Jean Dupont" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="vous@entreprise.fr" />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Mot de passe *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="8 caractères minimum" />
              </div>
              {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3"><p className="text-sm text-red-400">{error}</p></div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setStep(1); setError(null) }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg py-2.5 text-sm transition-all">← Retour</button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-all flex items-center justify-center gap-2">
                  {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Création...</> : 'Créer mon compte'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Déjà un compte ?{' '}
          <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}
