'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createProject } from '@/lib/actions/projets'

export default function NouveauProjetPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isAllotted, setIsAllotted] = useState(false)
  const [lotsCount, setLotsCount] = useState(2)
  const [lots, setLots] = useState([
    { title: 'Lot 1', desc: '' },
    { title: 'Lot 2', desc: '' },
  ])

  function handleLotsCountChange(n: number) {
    const count = Math.max(1, Math.min(10, n))
    setLotsCount(count)
    setLots(prev => {
      const next = [...prev]
      while (next.length < count) next.push({ title: `Lot ${next.length + 1}`, desc: '' })
      return next.slice(0, count)
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('is_allotted', isAllotted ? 'true' : 'false')
    formData.set('lots_count', lotsCount.toString())
    lots.forEach((l, i) => {
      formData.set(`lot_${i + 1}_title`, l.title)
      formData.set(`lot_${i + 1}_desc`, l.desc)
    })

    startTransition(async () => {
      const result = await createProject(formData)
      if (result?.error) setError(result.error)
      else if (result?.projectId) router.push(`/projets/${result.projectId}`)
    })
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/projets" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour aux projets
        </Link>
        <h1 className="text-2xl font-bold text-white">Nouveau projet AO</h1>
        <p className="text-slate-400 text-sm mt-1">Créez le projet, puis importez le DCE pour lancer l'analyse IA.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identification */}
        <Section title="Identification de l'appel d'offres">
          <Field label="Intitulé du marché" required>
            <input name="title" required className={inp} placeholder="Travaux de voirie — Secteur Nord" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Référence / N° de consultation">
              <input name="reference" className={inp} placeholder="2024-AO-001" />
            </Field>
            <Field label="Acheteur public">
              <input name="buyer_name" className={inp} placeholder="Communauté de communes..." />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Lieu d'exécution">
              <input name="location" className={inp} placeholder="Lyon Métropole (69)" />
            </Field>
            <Field label="Montant estimé (€ HT)">
              <input name="estimated_amount" type="number" min="0" className={inp} placeholder="500 000" />
            </Field>
          </div>
          <Field label="Lien vers l'annonce (PLACE, BOAMP...)">
            <input name="source_url" type="url" className={inp} placeholder="https://www.marches-publics.gouv.fr/..." />
          </Field>
        </Section>

        {/* DLRO */}
        <Section title="Date limite de remise des offres">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-3">
            <p className="text-xs text-amber-400">⚠️ La DLRO sera extraite automatiquement du RC lors de l'analyse DCE. Vous pouvez la saisir manuellement maintenant si vous la connaissez.</p>
          </div>
          <Field label="DLRO (date + heure)">
            <input name="dlro" type="datetime-local" className={inp} />
          </Field>
        </Section>

        {/* Allotissement */}
        <Section title="Allotissement">
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setIsAllotted(false)}
              className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-all ${
                !isAllotted ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="text-xl mb-1">📄</div>
              Marché unique
            </button>
            <button
              type="button"
              onClick={() => setIsAllotted(true)}
              className={`flex-1 py-3 rounded-lg text-sm font-medium border transition-all ${
                isAllotted ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="text-xl mb-1">📦</div>
              Marché alloti en lots
            </button>
          </div>

          {isAllotted && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Field label="Nombre de lots">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleLotsCountChange(lotsCount - 1)} className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded text-white transition-all">−</button>
                    <span className="text-white font-bold w-8 text-center">{lotsCount}</span>
                    <button type="button" onClick={() => handleLotsCountChange(lotsCount + 1)} className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded text-white transition-all">+</button>
                  </div>
                </Field>
              </div>
              <div className="space-y-2">
                {lots.map((lot, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={lot.title}
                      onChange={e => setLots(prev => prev.map((l, j) => j === i ? { ...l, title: e.target.value } : l))}
                      className={`flex-1 ${inp}`}
                      placeholder={`Lot ${i + 1} — Intitulé`}
                    />
                    <input
                      value={lot.desc}
                      onChange={e => setLots(prev => prev.map((l, j) => j === i ? { ...l, desc: e.target.value } : l))}
                      className={`flex-1 ${inp}`}
                      placeholder="Description (optionnel)"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Link href="/projets" className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg py-3 text-sm transition-all">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="flex-2 flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg py-3 text-sm transition-all flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Création en cours...
              </>
            ) : 'Créer le projet → Importer le DCE'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 space-y-4">
      <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

const inp = `w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2.5 text-sm
  placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`
