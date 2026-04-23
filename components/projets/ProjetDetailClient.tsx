'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  createDceVersion,
  registerDceDocument,
  classifyAllDocuments,
  validateDocumentClassification,
  updateProjectStatus,
} from '@/lib/actions/projets'
import type { Project, Lot, DceDocument, DceDocumentVersion } from '@/types/projet'
import { PROJECT_STATUS_CONFIG, DCE_DOC_TYPE_CONFIG, formatFileSize } from '@/types/projet'

interface Props {
  project: Project
  lots: Lot[]
  versions: DceDocumentVersion[]
  documents: DceDocument[]
  extractions: any[]
  currentVersionId: string | null
}

const TABS = [
  { id: 'apercu',     label: '📊 Aperçu' },
  { id: 'dce',        label: '📂 DCE' },
  { id: 'analyse',    label: '🔍 Analyse',    href: 'analyse' },
  { id: 'conformite', label: '✅ Conformité',  href: 'conformite' },
  { id: 'memoire',    label: '📝 Mémoire',     href: 'memoire' },
  { id: 'prix',       label: '💶 Prix',        href: 'prix' },
  { id: 'chat',       label: '💬 Assistant',   href: 'chat' },
  { id: 'export',     label: '📦 Export',      href: 'export' },
  { id: 'lots',       label: '📦 Lots' },
]

export function ProjetDetailClient({ project, lots, versions, documents, extractions, currentVersionId }: Props) {
  const [activeTab, setActiveTab] = useState('apercu')
  const [isPending, startTransition] = useTransition()
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [isClassifying, setIsClassifying] = useState(false)
  const [classifyDone, setClassifyDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const statusConfig = PROJECT_STATUS_CONFIG[project.status]

  // Calculer progression globale
  const globalProgress = lots.length > 0
    ? Math.round(lots.reduce((acc, l) =>
        acc + (l.progress_analyse + l.progress_memoire + l.progress_admin + l.progress_prix) / 4, 0) / lots.length)
    : 0

  const dlroDiff = project.dlro
    ? Math.ceil((new Date(project.dlro).getTime() - Date.now()) / 86400000)
    : null

  // Upload DCE complet
  async function handleDceUpload(files: FileList | null) {
    if (!files?.length) return
    setError(null)

    startTransition(async () => {
      // 1. Créer une nouvelle version
      const label = versions.length === 0 ? 'DCE initial' : `Rectificatif n°${versions.length}`
      const versionResult = await createDceVersion(project.id, label)
      if (versionResult.error || !versionResult.version) {
        setError(versionResult.error || 'Erreur création version')
        return
      }

      const versionId = versionResult.version.id
      const supabase = createClient()

      // 2. Uploader chaque fichier vers Supabase Storage
      for (const file of Array.from(files)) {
        const path = `${project.company_id}/${project.id}/${versionId}/${Date.now()}_${file.name}`
        setUploadProgress(p => ({ ...p, [file.name]: 0 }))

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('company-documents')
          .upload(path, file, { upsert: false })

        if (uploadError) {
          setError(`Erreur upload ${file.name}: ${uploadError.message}`)
          continue
        }

        const { data: { publicUrl } } = supabase.storage
          .from('company-documents')
          .getPublicUrl(path)

        // 3. Enregistrer en DB
        await registerDceDocument({
          projectId: project.id,
          versionId,
          fileName: file.name,
          fileUrl: publicUrl,
          fileSize: file.size,
          mimeType: file.type,
        })

        setUploadProgress(p => ({ ...p, [file.name]: 100 }))
      }

      // 4. Lancer la classification IA en batch
      setIsClassifying(true)
      await classifyAllDocuments(project.id, versionId)
      setIsClassifying(false)
      setClassifyDone(true)
    })
  }

  async function handleStatusChange(newStatus: string) {
    startTransition(() => updateProjectStatus(project.id, newStatus))
  }

  const pendingUploads = Object.entries(uploadProgress).filter(([, p]) => p < 100)
  const completedUploads = Object.entries(uploadProgress).filter(([, p]) => p === 100)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/projets" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Mes projets
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">{project.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {project.buyer_name && <span className="text-sm text-slate-400">🏛️ {project.buyer_name}</span>}
              {project.location && <span className="text-sm text-slate-500">📍 {project.location}</span>}
              {project.reference && <span className="text-xs text-slate-600">#{project.reference}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* DLRO badge */}
            {dlroDiff !== null && (
              <div className={`px-3 py-2 rounded-lg text-center ${
                dlroDiff <= 3 ? 'bg-red-500/20 border border-red-500/30' :
                dlroDiff <= 10 ? 'bg-amber-500/20 border border-amber-500/30' :
                'bg-slate-800/50 border border-slate-700/50'
              }`}>
                <p className={`text-xs font-medium ${dlroDiff <= 3 ? 'text-red-300' : dlroDiff <= 10 ? 'text-amber-300' : 'text-slate-400'}`}>DLRO</p>
                <p className={`text-lg font-bold ${dlroDiff <= 3 ? 'text-red-300' : dlroDiff <= 10 ? 'text-amber-300' : 'text-white'}`}>
                  {dlroDiff < 0 ? 'Passée' : `J-${dlroDiff}`}
                </p>
                <p className="text-[10px] text-slate-500">
                  {project.dlro && new Date(project.dlro).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}

            {/* Statut select */}
            <div className="relative">
              <select
                value={project.status}
                onChange={e => handleStatusChange(e.target.value)}
                className={`appearance-none px-3 py-2 pr-7 rounded-lg text-sm font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusConfig.bg} ${statusConfig.color} border-current/20`}
              >
                {Object.entries(PROJECT_STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar globale */}
      {globalProgress > 0 && (
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs text-slate-500 w-28">Avancement global</span>
          <div className="flex-1 bg-slate-800 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all ${globalProgress >= 80 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${globalProgress}%` }} />
          </div>
          <span className="text-xs font-medium text-slate-400 w-8">{globalProgress}%</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700/50 mb-6">
        {TABS.map(tab => (
          tab.href ? (
            <a
              key={tab.id}
              href={`/projets/${project.id}/${tab.href}`}
              className="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition-all"
            >
              {tab.label}
            </a>
          ) : (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          )
        ))}
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* ═══════ TAB : APERÇU ═══════ */}
      {activeTab === 'apercu' && (
        <div className="space-y-4">
          {/* Si pas encore de DCE */}
          {documents.length === 0 && (
            <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-6 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-white mb-1">Prochaine étape : importer le DCE</p>
                <p className="text-sm text-slate-400">Importez les pièces du dossier de consultation (RC, CCAP, CCTP, DPGF...) pour lancer l'analyse IA.</p>
                <button
                  onClick={() => setActiveTab('dce')}
                  className="mt-3 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
                >
                  Importer le DCE →
                </button>
              </div>
            </div>
          )}

          {/* Infos projet */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="font-semibold text-white text-sm mb-4">Informations du marché</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Acheteur', value: project.buyer_name },
                { label: 'Localisation', value: project.location },
                { label: 'Référence', value: project.reference },
                { label: 'Montant estimé', value: project.estimated_amount ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(project.estimated_amount) : null },
                { label: 'Durée', value: project.market_duration },
                { label: 'Visite', value: project.visit_mandatory ? `Obligatoire${project.visit_date ? ` — ${new Date(project.visit_date).toLocaleDateString('fr-FR')}` : ''}` : project.visit_date ? 'Facultative' : 'Non mentionnée' },
              ].map(info => info.value && (
                <div key={info.label}>
                  <p className="text-xs text-slate-500">{info.label}</p>
                  <p className="text-sm text-white mt-0.5">{info.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lots */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
            <h3 className="font-semibold text-white text-sm mb-4">{lots.length > 1 ? `${lots.length} Lots` : 'Lot unique'}</h3>
            <div className="space-y-2">
              {lots.map(lot => {
                const prog = Math.round((lot.progress_analyse + lot.progress_memoire + lot.progress_admin + lot.progress_prix) / 4)
                return (
                  <div key={lot.id} className="flex items-center gap-3 py-2">
                    <span className="text-xs font-bold text-slate-500 w-8">L{lot.number}</span>
                    <span className="text-sm text-white flex-1">{lot.title}</span>
                    <div className="flex items-center gap-2">
                      {prog > 0 && (
                        <>
                          <div className="w-20 bg-slate-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${prog}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-8">{prog}%</span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TAB : DCE ═══════ */}
      {activeTab === 'dce' && (
        <div className="space-y-5">
          {/* Zone d'upload */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              isPending ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-600 hover:border-blue-500/50 hover:bg-blue-500/5'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleDceUpload(e.dataTransfer.files) }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.zip,.png,.jpg,.jpeg"
              className="hidden"
              onChange={e => handleDceUpload(e.target.files)}
            />
            <div className="w-14 h-14 bg-slate-800 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="font-medium text-white mb-1">
              {isPending ? 'Upload en cours...' : 'Glisser-déposer les pièces du DCE'}
            </p>
            <p className="text-sm text-slate-500">PDF, DOCX, XLSX, ZIP, plans — Sélection multiple</p>
            {versions.length > 0 && (
              <p className="text-xs text-amber-400 mt-2">⚠️ Un nouvel upload créera une nouvelle version du DCE (rectificatif)</p>
            )}
          </div>

          {/* Progression upload */}
          {Object.keys(uploadProgress).length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
              {Object.entries(uploadProgress).map(([name, prog]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 flex-1 truncate">{name}</span>
                  <div className="w-24 bg-slate-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${prog === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${prog}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-8">{prog}%</span>
                </div>
              ))}
              {isClassifying && (
                <div className="flex items-center gap-2 pt-1">
                  <svg className="animate-spin w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-xs text-blue-400">Classification IA en cours...</span>
                </div>
              )}
              {classifyDone && (
                <p className="text-xs text-green-400">✓ Classification IA terminée — vérifiez les résultats ci-dessous</p>
              )}
            </div>
          )}

          {/* Versions */}
          {versions.length > 0 && (
            <div className="flex items-center gap-2">
              {versions.map(v => (
                <span key={v.id} className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-3 py-1 rounded-full">
                  v{v.version} — {v.label}
                </span>
              ))}
            </div>
          )}

          {/* Documents classifiés */}
          {documents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white text-sm">{documents.length} document{documents.length > 1 ? 's' : ''} importé{documents.length > 1 ? 's' : ''}</h3>
              </div>
              <div className="space-y-2">
                {documents.map(doc => {
                  const typeConfig = DCE_DOC_TYPE_CONFIG[doc.doc_type]
                  const isLowConfidence = (doc.classification_confidence ?? 1) < 0.7
                  return (
                    <div key={doc.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      isLowConfidence && !doc.classification_validated
                        ? 'bg-amber-500/5 border-amber-500/20'
                        : 'bg-slate-800/40 border-slate-700/40'
                    }`}>
                      {/* Type badge */}
                      <span className={`text-[10px] font-bold px-2 py-1 rounded border flex-shrink-0 ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>

                      {/* Nom */}
                      <span className="text-sm text-white flex-1 truncate">{doc.file_name}</span>

                      {/* Scope */}
                      <span className="text-xs text-slate-500">{doc.scope === 'commun' ? 'Commun' : `Lot ${doc.lot_id?.slice(-4) ?? '?'}`}</span>

                      {/* Taille */}
                      {doc.file_size && <span className="text-xs text-slate-600">{formatFileSize(doc.file_size)}</span>}

                      {/* Confiance */}
                      {doc.classification_confidence !== null && !doc.classification_validated && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          (doc.classification_confidence ?? 0) >= 0.8
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {Math.round((doc.classification_confidence ?? 0) * 100)}%
                        </span>
                      )}

                      {/* Validé */}
                      {doc.classification_validated && (
                        <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">✓ Validé</span>
                      )}

                      {/* Actions si confiance faible */}
                      {isLowConfidence && !doc.classification_validated && (
                        <DocTypeSelector doc={doc} lots={lots} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB : ANALYSE ═══════ */}
      {activeTab === 'analyse' && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-slate-300 font-medium mb-1">Analyse DCE</p>
          <p className="text-slate-500 text-sm">
            {documents.length === 0
              ? 'Importez d\'abord le DCE pour lancer l\'analyse.'
              : 'L\'analyse IA du DCE sera disponible dans le prochain module.'}
          </p>
          {documents.length === 0 && (
            <button onClick={() => setActiveTab('dce')} className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
              → Onglet DCE
            </button>
          )}
        </div>
      )}

      {/* ═══════ TAB : LOTS ═══════ */}
      {activeTab === 'lots' && (
        <div className="space-y-3">
          {lots.map(lot => (
            <div key={lot.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-white">Lot {lot.number} — {lot.title}</h3>
                  {lot.description && <p className="text-xs text-slate-500 mt-0.5">{lot.description}</p>}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  lot.status === 'exporte' ? 'bg-green-500/20 text-green-400' :
                  lot.status === 'validation' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-700 text-slate-400'
                }`}>{lot.status}</span>
              </div>

              {/* Progression par bloc */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Analyse', value: lot.progress_analyse, validated: null },
                  { label: 'Mémoire', value: lot.progress_memoire, validated: lot.memoire_validated_at },
                  { label: 'Admin', value: lot.progress_admin, validated: lot.admin_validated_at },
                  { label: 'Prix', value: lot.progress_prix, validated: lot.prix_validated_at },
                ].map(bloc => (
                  <div key={bloc.label} className="text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-1 relative" style={{
                      background: `conic-gradient(${bloc.value >= 100 ? '#22c55e' : '#3b82f6'} ${bloc.value * 3.6}deg, #1e293b ${bloc.value * 3.6}deg)`
                    }}>
                      <div className="w-9 h-9 bg-slate-900 rounded-full flex items-center justify-center">
                        {bloc.validated ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300">{bloc.value}%</span>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">{bloc.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Sélecteur de type pour les docs à faible confiance
function DocTypeSelector({ doc, lots }: { doc: DceDocument; lots: Lot[] }) {
  const [isPending, startTransition] = useTransition()
  const [selectedType, setSelectedType] = useState(doc.doc_type)

  async function handleValidate() {
    startTransition(() =>
      validateDocumentClassification(doc.id, selectedType, doc.scope)
    )
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={selectedType}
        onChange={e => setSelectedType(e.target.value as any)}
        className="text-xs bg-slate-700 border border-slate-600 text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {Object.entries(DCE_DOC_TYPE_CONFIG).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>
      <button
        onClick={handleValidate}
        disabled={isPending}
        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-all"
      >
        {isPending ? '...' : '✓'}
      </button>
    </div>
  )
}
