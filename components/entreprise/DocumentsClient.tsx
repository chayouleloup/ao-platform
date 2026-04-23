'use client'

import { useState, useTransition } from 'react'
import { createDocument, deleteDocument } from '@/lib/actions/entreprise'
import type { CompanyDocument, DocumentStatus } from '@/types/entreprise'
import { DOCUMENT_CATEGORIES } from '@/types/entreprise'

interface Props {
  documents: CompanyDocument[]
  counts: { valid: number; expiring: number; expired: number }
  companyId: string
}

const STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string; bg: string; border: string }> = {
  valid: { label: 'Valide', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  expiring_soon: { label: 'Bientôt expiré', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  expired: { label: 'Expiré', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  missing: { label: 'Manquant', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
}

// Documents types suggérés (pour aider l'utilisateur)
const SUGGESTED_DOCS = [
  { name: 'Kbis', category: 'administratif', expires: true },
  { name: 'Statuts', category: 'administratif', expires: false },
  { name: 'RC Professionnelle', category: 'assurance', expires: true },
  { name: 'Attestation URSSAF', category: 'social', expires: true },
  { name: 'Attestation fiscale (impôts)', category: 'financier', expires: true },
  { name: 'Bilan N-1', category: 'financier', expires: false },
  { name: 'Décennale', category: 'assurance', expires: true },
]

export function DocumentsClient({ documents, counts, companyId }: Props) {
  const [modal, setModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<DocumentStatus | 'all'>('all')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<string>('')

  const filtered = documents.filter(d =>
    filterStatus === 'all' || d.status === filterStatus
  )

  async function handleCreate(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createDocument(formData)
      if (result?.error) setError(result.error)
      else setModal(false)
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce document ?')) return
    startTransition(() => deleteDocument(id))
  }

  // Documents manquants suggérés
  const presentNames = documents.map(d => d.name)
  const missing = SUGGESTED_DOCS.filter(s => !presentNames.includes(s.name))

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Tous', value: documents.length, status: 'all' as const, color: 'text-white', bg: 'bg-slate-800/50 border-slate-700/50' },
          { label: 'Valides', value: counts.valid, status: 'valid' as const, color: 'text-green-400', bg: 'bg-green-500/5 border-green-500/20' },
          { label: 'Bientôt expirés', value: counts.expiring, status: 'expiring_soon' as const, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20' },
          { label: 'Expirés', value: counts.expired, status: 'expired' as const, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20' },
        ].map(s => (
          <button
            key={s.status}
            onClick={() => setFilterStatus(s.status)}
            className={`border rounded-xl p-4 text-left transition-all ${s.bg} ${filterStatus === s.status ? 'ring-2 ring-blue-500' : 'hover:opacity-80'}`}
          >
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Documents suggérés manquants */}
      {missing.length > 0 && (
        <div className="mb-5 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-400 mb-2">📋 Documents recommandés non encore ajoutés :</p>
          <div className="flex flex-wrap gap-2">
            {missing.map(m => (
              <button
                key={m.name}
                onClick={() => { setSelectedDoc(m.name); setModal(true) }}
                className="text-xs bg-slate-700/50 hover:bg-blue-600/20 hover:text-blue-300 text-slate-400 border border-slate-600/50 hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all"
              >
                + {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">
          {filtered.length} document{filtered.length > 1 ? 's' : ''}
          {filterStatus !== 'all' && ` · filtre : ${STATUS_CONFIG[filterStatus].label}`}
        </p>
        <button
          onClick={() => { setSelectedDoc(''); setModal(true) }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter un document
        </button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
          <p className="text-slate-500 text-sm">
            {documents.length === 0 ? 'Aucun document. Commencez par ajouter votre Kbis et vos attestations.' : `Aucun document dans ce statut.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => {
            const config = STATUS_CONFIG[doc.status]
            return (
              <div key={doc.id} className={`flex items-center gap-4 p-4 border rounded-xl transition-all group ${config.bg} ${config.border}`}>
                {/* Icône fichier */}
                <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white text-sm">{doc.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.color} ${config.bg} border ${config.border}`}>
                      {config.label}
                    </span>
                    {doc.version > 1 && <span className="text-[10px] text-slate-500">v{doc.version}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {doc.category && <span className="text-xs text-slate-500">{doc.category}</span>}
                    {doc.issued_at && <span className="text-xs text-slate-500">Émis le {new Date(doc.issued_at).toLocaleDateString('fr-FR')}</span>}
                    {doc.expires_at && (
                      <span className={`text-xs ${config.color}`}>
                        Expire le {new Date(doc.expires_at).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    {doc.file_name && <span className="text-xs text-slate-600 truncate max-w-[200px]">📎 {doc.file_name}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </a>
                  )}
                  <button onClick={() => handleDelete(doc.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal ajout */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="font-semibold text-white">Nouveau document</h3>
              <button onClick={() => setModal(false)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(new FormData(e.currentTarget)) }} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nom du document <span className="text-red-400">*</span></label>
                <input
                  name="name"
                  required
                  defaultValue={selectedDoc}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Kbis, RC Pro, Attestation URSSAF..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Catégorie</label>
                <select name="category" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                  <option value="">Sélectionner</option>
                  {DOCUMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Date d'émission</label>
                  <input name="issued_at" type="date" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Date d'expiration</label>
                  <input name="expires_at" type="date" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                <input name="notes" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="Optionnel" />
              </div>
              <p className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-3">
                💡 L'upload de fichier sera disponible une fois le bucket Supabase Storage configuré.
              </p>
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
                <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-all">
                  {isPending ? 'Enregistrement...' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
