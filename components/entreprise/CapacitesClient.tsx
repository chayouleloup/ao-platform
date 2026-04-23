'use client'

import { useState, useTransition } from 'react'
import {
  createCertification, deleteCertification,
  createStaff, deleteStaff,
  createEquipment, deleteEquipment,
} from '@/lib/actions/entreprise'
import type { CompanyCertification, CompanyStaff, CompanyEquipment } from '@/types/entreprise'
import { CERTIFICATION_TYPES } from '@/types/entreprise'

interface Props {
  certifications: CompanyCertification[]
  staff: CompanyStaff[]
  equipment: CompanyEquipment[]
}

export function CapacitesClient({ certifications, staff, equipment }: Props) {
  const [activeTab, setActiveTab] = useState<'certifs' | 'staff' | 'equipement'>('certifs')
  const [modal, setModal] = useState<null | 'certif' | 'staff' | 'equipment'>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(type: typeof modal, formData: FormData) {
    setError(null)
    startTransition(async () => {
      let result
      if (type === 'certif') result = await createCertification(formData)
      else if (type === 'staff') result = await createStaff(formData)
      else if (type === 'equipment') result = await createEquipment(formData)
      if (result?.error) setError(result.error)
      else setModal(null)
    })
  }

  async function handleDelete(type: string, id: string) {
    if (!confirm('Supprimer cet élément ?')) return
    startTransition(async () => {
      if (type === 'certif') await deleteCertification(id)
      else if (type === 'staff') await deleteStaff(id)
      else if (type === 'equipment') await deleteEquipment(id)
    })
  }

  const tabs = [
    { id: 'certifs' as const, label: 'Certifications', count: certifications.length, icon: '🏅' },
    { id: 'staff' as const, label: 'Moyens humains', count: staff.length, icon: '👷' },
    { id: 'equipement' as const, label: 'Moyens techniques', count: equipment.length, icon: '🚧' },
  ]

  return (
    <div>
      {/* Sous-tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-slate-200'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-blue-600/30 text-blue-300' : 'bg-slate-700 text-slate-500'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* CERTIFICATIONS */}
      {activeTab === 'certifs' && (
        <Section
          title="Certifications & Qualifications"
          onAdd={() => setModal('certif')}
          addLabel="Ajouter une certification"
          empty={certifications.length === 0}
          emptyText="Ajoutez vos certifications Qualibat, RGE, ISO... Elles seront insérées automatiquement dans vos mémoires."
        >
          {certifications.map(c => (
            <Card key={c.id} onDelete={() => handleDelete('certif', c.id)}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-white text-sm">{c.name}</p>
                  {c.issuer && <p className="text-xs text-slate-400">{c.issuer} {c.number && `· n° ${c.number}`}</p>}
                  {c.expires_at && (
                    <p className={`text-xs mt-1 ${
                      new Date(c.expires_at) < new Date() ? 'text-red-400' :
                      new Date(c.expires_at) < new Date(Date.now() + 30*86400000) ? 'text-amber-400' : 'text-green-400'
                    }`}>
                      Expire le {new Date(c.expires_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
                <StatusBadge expiresAt={c.expires_at} />
              </div>
            </Card>
          ))}
        </Section>
      )}

      {/* STAFF */}
      {activeTab === 'staff' && (
        <Section
          title="Moyens humains"
          onAdd={() => setModal('staff')}
          addLabel="Ajouter un profil"
          empty={staff.length === 0}
          emptyText="Ajoutez les fiches de votre équipe. Elles seront utilisées pour présenter vos compétences dans les mémoires."
        >
          {staff.map(s => (
            <Card key={s.id} onDelete={() => handleDelete('staff', s.id)}>
              <p className="font-medium text-white text-sm">{s.full_name}</p>
              {s.job_title && <p className="text-xs text-slate-400">{s.job_title}</p>}
              {s.experience_years && <p className="text-xs text-slate-500">{s.experience_years} ans d'expérience</p>}
              {s.qualifications.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.qualifications.map(q => (
                    <span key={q} className="text-[10px] bg-blue-600/20 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full">{q}</span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </Section>
      )}

      {/* ÉQUIPEMENT */}
      {activeTab === 'equipement' && (
        <Section
          title="Moyens techniques & matériels"
          onAdd={() => setModal('equipment')}
          addLabel="Ajouter un matériel"
          empty={equipment.length === 0}
          emptyText="Listez vos engins, véhicules et équipements. Ils apparaîtront dans la section moyens techniques de vos mémoires."
        >
          {equipment.map(e => (
            <Card key={e.id} onDelete={() => handleDelete('equipment', e.id)}>
              <p className="font-medium text-white text-sm">{e.name}</p>
              <p className="text-xs text-slate-400">
                {[e.brand, e.model, e.year].filter(Boolean).join(' · ')}
              </p>
              {e.capacity && <p className="text-xs text-slate-500">Capacité : {e.capacity}</p>}
              {e.location && <p className="text-xs text-slate-500">📍 {e.location}</p>}
              {e.quantity > 1 && <p className="text-xs text-blue-400">× {e.quantity}</p>}
            </Card>
          ))}
        </Section>
      )}

      {/* Modales */}
      {modal === 'certif' && (
        <Modal title="Nouvelle certification" onClose={() => setModal(null)} onSubmit={(fd) => handleCreate('certif', fd)} isPending={isPending} error={error}>
          <Field label="Nom de la certification" required>
            <select name="name" className={inputClass} required>
              <option value="">Sélectionner ou saisir</option>
              {CERTIFICATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Organisme émetteur"><input name="issuer" className={inputClass} placeholder="Qualibat" /></Field>
            <Field label="Numéro"><input name="number" className={inputClass} placeholder="1234567" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date d'émission"><input name="issued_at" type="date" className={inputClass} /></Field>
            <Field label="Date d'expiration"><input name="expires_at" type="date" className={inputClass} /></Field>
          </div>
          <Field label="Notes"><textarea name="notes" className={`${inputClass} resize-none`} rows={2} /></Field>
        </Modal>
      )}

      {modal === 'staff' && (
        <Modal title="Nouveau profil RH" onClose={() => setModal(null)} onSubmit={(fd) => handleCreate('staff', fd)} isPending={isPending} error={error}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom complet" required><input name="full_name" required className={inputClass} placeholder="Jean Dupont" /></Field>
            <Field label="Fonction"><input name="job_title" className={inputClass} placeholder="Chargé d'affaires" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Années d'expérience"><input name="experience_years" type="number" min="0" className={inputClass} placeholder="10" /></Field>
            <Field label="Disponibilité"><input name="availability" className={inputClass} placeholder="Disponible immédiatement" /></Field>
          </div>
          <Field label="Habilitations / Qualifications (séparées par virgule)">
            <input name="qualifications" className={inputClass} placeholder="CACES R489, Habilitation élec. B1..." />
          </Field>
          <Field label="Compétences (séparées par virgule)">
            <input name="skills" className={inputClass} placeholder="Gestion de chantier, AutoCAD..." />
          </Field>
          <Field label="Notes"><textarea name="notes" className={`${inputClass} resize-none`} rows={2} /></Field>
        </Modal>
      )}

      {modal === 'equipment' && (
        <Modal title="Nouveau matériel" onClose={() => setModal(null)} onSubmit={(fd) => handleCreate('equipment', fd)} isPending={isPending} error={error}>
          <Field label="Nom du matériel" required><input name="name" required className={inputClass} placeholder="Pelle hydraulique CAT 320" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie"><input name="category" className={inputClass} placeholder="Engins de terrassement" /></Field>
            <Field label="Marque"><input name="brand" className={inputClass} placeholder="Caterpillar" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Modèle"><input name="model" className={inputClass} placeholder="320" /></Field>
            <Field label="Année"><input name="year" type="number" className={inputClass} placeholder="2020" /></Field>
            <Field label="Quantité"><input name="quantity" type="number" min="1" defaultValue="1" className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacité"><input name="capacity" className={inputClass} placeholder="20 tonnes" /></Field>
            <Field label="Localisation"><input name="location" className={inputClass} placeholder="Dépôt Marseille" /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────

function Section({ title, onAdd, addLabel, empty, emptyText, children }: {
  title: string
  onAdd: () => void
  addLabel: string
  empty: boolean
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">{title}</h3>
        <button onClick={onAdd} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {addLabel}
        </button>
      </div>
      {empty ? (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-500 text-sm">{emptyText}</p>
          <button onClick={onAdd} className="mt-3 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
            + Ajouter maintenant
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
      )}
    </div>
  )
}

function Card({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 group">
      <div className="flex justify-between gap-2">
        <div className="flex-1">{children}</div>
        <button onClick={onDelete} className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Valide</span>
  const exp = new Date(expiresAt)
  const now = new Date()
  if (exp < now) return <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Expiré</span>
  if (exp < new Date(Date.now() + 30*86400000)) return <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">Bientôt</span>
  return <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">Valide</span>
}

function Modal({ title, onClose, onSubmit, isPending, error, children }: {
  title: string
  onClose: () => void
  onSubmit: (fd: FormData) => void
  isPending: boolean
  error: string | null
  children: React.ReactNode
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(new FormData(e.currentTarget))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {children}
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
            <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-all">
              {isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = `w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm
  placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`
