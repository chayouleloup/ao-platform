'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { registerAction } from '@/lib/actions/auth'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<1 | 2>(1)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await registerAction(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setSuccess(result.message ?? 'Compte créé avec succès !')
      }
    })
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Compte créé !</h2>
          <p className="text-slate-400 mb-6">{success}</p>
          <Link
            href="/auth/login"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 px-6 text-sm transition-all"
          >
            Se connecter
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">AO Platform</span>
          </div>
          <p className="text-slate-400 text-sm">Créez votre espace en 2 minutes</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-all ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'
              }`}>
                {step > s ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s}
              </div>
              <span className={`ml-2 text-xs ${step >= s ? 'text-slate-300' : 'text-slate-600'}`}>
                {s === 1 ? 'Votre entreprise' : 'Votre compte'}
              </span>
              {s < 2 && <div className={`flex-1 h-px mx-3 ${step > s ? 'bg-blue-600' : 'bg-slate-800'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* ÉTAPE 1 — Entreprise */}
            <div className={step === 1 ? 'block' : 'hidden'}>
              <h2 className="text-lg font-semibold text-white mb-4">Votre entreprise</h2>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Raison sociale <span className="text-red-400">*</span>
                </label>
                <input
                  name="company_name"
                  type="text"
                  required={step === 1}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
                             placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="ACME Travaux SAS"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  SIRET <span className="text-slate-500 font-normal">(optionnel)</span>
                </label>
                <input
                  name="siret"
                  type="text"
                  pattern="[0-9]{14}"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
                             placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="12345678901234"
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 text-sm mt-6 transition-all"
              >
                Continuer →
              </button>
            </div>

            {/* ÉTAPE 2 — Compte */}
            <div className={step === 2 ? 'block' : 'hidden'}>
              <h2 className="text-lg font-semibold text-white mb-4">Votre compte administrateur</h2>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Nom complet <span className="text-red-400">*</span>
                </label>
                <input
                  name="full_name"
                  type="text"
                  required={step === 2}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
                             placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Jean Dupont"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  required={step === 2}
                  autoComplete="email"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
                             placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="vous@entreprise.fr"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Mot de passe <span className="text-red-400">*</span>
                </label>
                <input
                  name="password"
                  type="password"
                  required={step === 2}
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
                             placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="8 caractères minimum"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-start gap-2 mt-2">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg py-2.5 text-sm transition-all"
                >
                  ← Retour
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg py-2.5 text-sm transition-all flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Création...
                    </>
                  ) : 'Créer mon compte'}
                </button>
              </div>
            </div>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          Déjà un compte ?{' '}
          <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
