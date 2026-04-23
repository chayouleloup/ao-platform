'use client'

import { useState, useTransition } from 'react'
import { updateCompanyIdentite } from '@/lib/actions/entreprise'
import type { Company } from '@/types/database'

const LEGAL_FORMS = ['SAS', 'SARL', 'SA', 'EURL', 'SNC', 'EI', 'SASU', 'GIE', 'Autre']

interface Props { company: Company }

export function IdentiteForm({ company }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateCompanyIdentite(formData)
      if (result?.error) setError(result.error)
      else setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informations légales */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Informations légales</h3>

        <Field label="Raison sociale" required>
          <input name="name" defaultValue={company.name} required
            className={inputClass} placeholder="ACME Travaux SAS" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Forme juridique">
            <select name="legal_form" defaultValue={company.legal_form ?? ''} className={inputClass}>
              <option value="">Sélectionner</option>
              {LEGAL_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Code APE">
            <input name="ape_code" defaultValue={company.ape_code ?? ''}
              className={inputClass} placeholder="4312A" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="SIRET">
            <input name="siret" defaultValue={company.siret ?? ''}
              pattern="[0-9]{14}" className={inputClass} placeholder="12345678901234" />
          </Field>
          <Field label="SIREN">
            <input name="siren" defaultValue={company.siren ?? ''}
              pattern="[0-9]{9}" className={inputClass} placeholder="123456789" />
          </Field>
        </div>

        <Field label="Numéro de TVA">
          <input name="tva_number" defaultValue={company.tva_number ?? ''}
            className={inputClass} placeholder="FR12345678901" />
        </Field>
      </div>

      {/* Adresse */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Adresse du siège</h3>

        <Field label="Adresse">
          <input name="address" defaultValue={company.address ?? ''}
            className={inputClass} placeholder="12 rue de la Paix" />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Code postal">
            <input name="postal_code" defaultValue={company.postal_code ?? ''}
              className={inputClass} placeholder="75001" />
          </Field>
          <div className="col-span-2">
            <Field label="Ville">
              <input name="city" defaultValue={company.city ?? ''}
                className={inputClass} placeholder="Paris" />
            </Field>
          </div>
        </div>
      </div>

      {/* Interlocuteur AO — CRITIQUE */}
      <div id="contact-ao" className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-2">
          <span className="text-blue-400 mt-0.5">ℹ️</span>
          <div>
            <h3 className="text-sm font-medium text-blue-300 uppercase tracking-wider">Interlocuteur dédié AO</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Inséré automatiquement dans tous vos mémoires techniques et pièces administratives.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom complet" required>
            <input name="ao_contact_name" defaultValue={company.ao_contact_name ?? ''}
              className={inputClass} placeholder="Jean Dupont" />
          </Field>
          <Field label="Fonction / Rôle">
            <input name="ao_contact_role" defaultValue={company.ao_contact_role ?? ''}
              className={inputClass} placeholder="Responsable appels d'offres" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <input name="ao_contact_email" type="email" defaultValue={company.ao_contact_email ?? ''}
              className={inputClass} placeholder="jean@entreprise.fr" />
          </Field>
          <Field label="Téléphone">
            <input name="ao_contact_phone" defaultValue={company.ao_contact_phone ?? ''}
              className={inputClass} placeholder="06 01 02 03 04" />
          </Field>
        </div>
      </div>

      {/* Capacités financières */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">Capacités financières</h3>
        <p className="text-xs text-slate-500">Chiffres d'affaires annuels HT (utilisés dans les DC2 et mémoires)</p>

        <div className="grid grid-cols-3 gap-4">
          {(['n1', 'n2', 'n3'] as const).map((n) => {
            const year = new Date().getFullYear() - Number(n.replace('n', ''))
            return (
              <Field key={n} label={`CA ${year} (€ HT)`}>
                <input
                  name={`revenue_${n}`}
                  type="number"
                  defaultValue={company[`revenue_${n}` as keyof Company] as number ?? ''}
                  className={inputClass}
                  placeholder="0"
                  min="0"
                  step="1000"
                />
              </Field>
            )
          })}
        </div>
      </div>

      {/* Feedback + Submit */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {saved && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-green-400">Informations sauvegardées</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg py-2.5 px-6 text-sm transition-all flex items-center gap-2"
      >
        {isPending ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Enregistrement...
          </>
        ) : 'Enregistrer les modifications'}
      </button>
    </form>
  )
}

function Field({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = `w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
  placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`
