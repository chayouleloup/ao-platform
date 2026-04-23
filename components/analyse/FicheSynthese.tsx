'use client'

import { useState } from 'react'
import { ExtractionField, ConfidenceBadge } from './ExtractionField'
import type { ExtractionResult, Criterion, DocItem, WarningPoint } from '@/lib/services/dce-extractor'

interface Props {
  extraction: any // from DB (project_extractions row)
  lots: Array<{ id: string; number: number; title: string }>
  lotId: string
}

const WARNING_CONFIG = {
  eliminatoire: { label: '🚫 Éliminatoire', bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-300' },
  critique: { label: '⚠️ Critique', bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-300' },
  attention: { label: 'ℹ️ Attention', bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-300' },
}

export function FicheSynthese({ extraction, lots, lotId }: Props) {
  const [activeSection, setActiveSection] = useState<string>('general')

  const extractionId = extraction.id
  const dlro = extraction.dlro
  const visitInfo = extraction.visit_info
  const criteria = extraction.criteria
  const requiredDocs = extraction.required_docs
  const formalConstraints = extraction.formal_constraints
  const warningPoints = extraction.warning_points

  const warnings: WarningPoint[] = warningPoints?.value ?? []
  const hasEliminatoires = warnings.some((w: WarningPoint) => w.type === 'eliminatoire')

  const SECTIONS = [
    { id: 'general', label: 'Infos clés', icon: '📋' },
    { id: 'criteria', label: 'Critères', icon: '⚖️' },
    { id: 'pieces', label: 'Pièces à fournir', icon: '📂' },
    { id: 'contraintes', label: 'Contraintes', icon: '📐' },
    { id: 'vigilance', label: `Vigilance ${hasEliminatoires ? '🚫' : warnings.length > 0 ? '⚠️' : ''}`, icon: '' },
  ]

  return (
    <div>
      {/* Sous-navigation */}
      <div className="flex gap-1 flex-wrap mb-6">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === s.id
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-slate-700/50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ═══════ SECTION : INFOS GÉNÉRALES ═══════ */}
      {activeSection === 'general' && (
        <div className="space-y-4">
          {/* DLRO — en vedette */}
          <div className={`border rounded-xl p-5 ${
            dlro?.not_specified
              ? 'bg-red-500/5 border-red-500/20'
              : (dlro?.confidence ?? 0) < 0.65
                ? 'bg-amber-500/5 border-amber-500/20'
                : 'bg-slate-800/50 border-slate-700/50'
          }`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⏰</span>
                <h3 className="font-semibold text-white">Date limite de remise des offres (DLRO)</h3>
              </div>
              <ConfidenceBadge confidence={dlro?.confidence ?? 0} notSpecified={dlro?.not_specified} />
            </div>
            {dlro?.value ? (
              <div>
                <p className="text-3xl font-bold text-white mb-1">
                  {new Date(dlro.value).toLocaleDateString('fr-FR', {
                    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
                  })}
                </p>
                <p className="text-lg text-blue-300 font-medium">
                  à {new Date(dlro.value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                {(() => {
                  const diff = Math.ceil((new Date(dlro.value).getTime() - Date.now()) / 86400000)
                  return diff > 0 ? (
                    <p className={`text-sm mt-2 font-medium ${diff <= 7 ? 'text-red-400' : diff <= 14 ? 'text-amber-400' : 'text-green-400'}`}>
                      J-{diff} {diff <= 7 ? '⚡ Urgent' : ''}
                    </p>
                  ) : (
                    <p className="text-sm mt-2 text-red-400">DLRO dépassée</p>
                  )
                })()}
                {dlro.source_doc && (
                  <p className="text-xs text-slate-500 mt-2">
                    📄 Source : {dlro.source_doc} {dlro.source_page && `· ${dlro.source_page}`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-500 italic text-sm">Non précisé dans les documents.</p>
            )}
          </div>

          {/* Grille infos */}
          <div className="grid grid-cols-2 gap-4">
            {/* Visite */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <span>🏗️</span>
                <h3 className="font-semibold text-white text-sm">Visite de site</h3>
                {visitInfo?.mandatory?.value === true && (
                  <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/20 px-2 py-0.5 rounded-full font-medium">OBLIGATOIRE</span>
                )}
                {visitInfo?.mandatory?.value === false && (
                  <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Facultative</span>
                )}
              </div>

              <Field label="Date de visite">
                {visitInfo?.date?.value
                  ? new Date(visitInfo.date.value).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long' })
                  : <span className="text-slate-600 italic text-xs">Non précisée</span>}
              </Field>
              <Field label="Contact visite">
                {visitInfo?.contact?.value ?? <span className="text-slate-600 italic text-xs">Non précisé</span>}
              </Field>
              <Field label="Lieu">
                {visitInfo?.location?.value ?? <span className="text-slate-600 italic text-xs">Non précisé</span>}
              </Field>
              {visitInfo?.attestation_required?.value && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-400">⚠️ Attestation de visite obligatoire à joindre au dossier</p>
                </div>
              )}
            </div>

            {/* Infos marché */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-white text-sm mb-3">Marché</h3>
              <Field label="Montant estimé">
                {extraction.estimated_amount?.value
                  ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
                      .format(extraction.estimated_amount.value)
                  : <span className="text-slate-600 italic text-xs">Non précisé</span>}
              </Field>
              <Field label="Durée">
                {extraction.market_duration?.value ?? <span className="text-slate-600 italic text-xs">Non précisée</span>}
              </Field>
              <Field label="Modalités de remise">
                {visitInfo?.modalities?.value ?? <span className="text-slate-600 italic text-xs">Non précisées</span>}
              </Field>
              {formalConstraints?.value?.submission_platform && (
                <Field label="Plateforme de dépôt">
                  <span className="text-blue-300">{formalConstraints.value.submission_platform}</span>
                </Field>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SECTION : CRITÈRES ═══════ */}
      {activeSection === 'criteria' && (
        <div>
          {criteria?.not_specified || !criteria?.value?.length ? (
            <EmptyState message="Critères de jugement non trouvés dans les documents." />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-4">
                <ConfidenceBadge confidence={criteria.confidence} notSpecified={criteria.not_specified} />
                {criteria.source_doc && (
                  <span className="text-xs text-slate-500">Source : {criteria.source_doc}</span>
                )}
              </div>

              {/* Barre visuelle des critères */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 mb-4">
                <h4 className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wider">Répartition des pondérations</h4>
                <div className="space-y-2">
                  {criteria.value.map((c: Criterion, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 w-52 truncate">{c.name}</span>
                      <div className="flex-1 bg-slate-700 rounded-full h-4 relative">
                        <div
                          className="h-4 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-end pr-2"
                          style={{ width: `${Math.min(c.weight, 100)}%` }}
                        >
                          <span className="text-[10px] font-bold text-white">{c.weight}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Détail par critère */}
              {criteria.value.map((c: Criterion, i: number) => (
                <div key={i} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-white">{c.name}</h4>
                    <span className="text-xl font-bold text-blue-400">{c.weight}%</span>
                  </div>
                  {c.source_page && <p className="text-xs text-slate-500 mb-2">📄 {c.source_page}</p>}
                  {c.sub_criteria && c.sub_criteria.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-700 pt-2">
                      {c.sub_criteria.map((sc, j) => (
                        <div key={j} className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="text-xs text-slate-300">{sc.name}</span>
                            {sc.description && <p className="text-[10px] text-slate-500 mt-0.5">{sc.description}</p>}
                          </div>
                          {sc.weight && <span className="text-xs font-medium text-slate-400 flex-shrink-0">{sc.weight}%</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ SECTION : PIÈCES À FOURNIR ═══════ */}
      {activeSection === 'pieces' && (
        <div>
          {requiredDocs?.not_specified || !requiredDocs?.value ? (
            <EmptyState message="Liste des pièces à fournir non trouvée dans les documents." />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <ConfidenceBadge confidence={requiredDocs.confidence} notSpecified={requiredDocs.not_specified} />
                {requiredDocs.source_doc && <span className="text-xs text-slate-500">Source : {requiredDocs.source_doc}</span>}
              </div>

              {([
                { key: 'candidature', label: 'Candidature', icon: '👤', color: 'blue' },
                { key: 'offre_technique', label: 'Offre technique', icon: '📝', color: 'purple' },
                { key: 'offre_financiere', label: 'Offre financière', icon: '💶', color: 'green' },
                { key: 'conditionnel', label: 'Conditionnel', icon: '⚙️', color: 'amber' },
              ] as const).map(cat => {
                const docs: DocItem[] = requiredDocs.value?.[cat.key] ?? []
                if (!docs.length) return null

                return (
                  <div key={cat.key} className={`border rounded-xl overflow-hidden ${
                    cat.color === 'blue' ? 'border-blue-500/20' :
                    cat.color === 'purple' ? 'border-purple-500/20' :
                    cat.color === 'green' ? 'border-green-500/20' :
                    'border-amber-500/20'
                  }`}>
                    <div className={`px-4 py-3 flex items-center justify-between ${
                      cat.color === 'blue' ? 'bg-blue-600/10' :
                      cat.color === 'purple' ? 'bg-purple-600/10' :
                      cat.color === 'green' ? 'bg-green-600/10' :
                      'bg-amber-600/10'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <h4 className="font-semibold text-white text-sm">{cat.label}</h4>
                      </div>
                      <span className="text-xs text-slate-400">{docs.length} pièce{docs.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {docs.map((doc: DocItem, i: number) => (
                        <div key={i} className="px-4 py-3 flex items-start gap-3 bg-slate-900/30">
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            doc.mandatory ? 'bg-red-500/20 border border-red-500/30' : 'bg-slate-700 border border-slate-600'
                          }`}>
                            <span className={`text-[8px] font-bold ${doc.mandatory ? 'text-red-400' : 'text-slate-500'}`}>
                              {doc.mandatory ? '!' : '?'}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-white">{doc.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {doc.format && (
                                <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{doc.format}</span>
                              )}
                              {doc.notes && <span className="text-[10px] text-slate-500">{doc.notes}</span>}
                              {doc.source_page && <span className="text-[10px] text-slate-600">📄 {doc.source_page}</span>}
                            </div>
                          </div>
                          <span className={`text-[10px] flex-shrink-0 px-2 py-0.5 rounded-full font-medium ${
                            doc.mandatory
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-slate-700 text-slate-500'
                          }`}>
                            {doc.mandatory ? 'Obligatoire' : 'Conditionnel'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ SECTION : CONTRAINTES FORMELLES ═══════ */}
      {activeSection === 'contraintes' && (
        <div>
          {formalConstraints?.not_specified || !formalConstraints?.value ? (
            <EmptyState message="Contraintes formelles non précisées dans les documents." />
          ) : (
            <div className="space-y-3">
              <ConfidenceBadge confidence={formalConstraints.confidence} notSpecified={formalConstraints.not_specified} />
              <div className="grid grid-cols-2 gap-3 mt-3">
                {formalConstraints.value.page_limit && (
                  <Constraint icon="📄" label="Limite de pages" value={`${formalConstraints.value.page_limit} pages max`} alert />
                )}
                {formalConstraints.value.required_template && (
                  <Constraint icon="📋" label="Trame imposée" value={formalConstraints.value.template_name ?? 'Oui — utiliser la trame fournie'} alert />
                )}
                {formalConstraints.value.signature_required && (
                  <Constraint icon="✍️" label="Signature requise" value={formalConstraints.value.signature_notes ?? 'Oui'} />
                )}
                {formalConstraints.value.submission_platform && (
                  <Constraint icon="🌐" label="Plateforme de dépôt" value={formalConstraints.value.submission_platform} />
                )}
                {formalConstraints.value.formats_required?.map((f: string) => (
                  <Constraint key={f} icon="💾" label="Format requis" value={f} />
                ))}
                {formalConstraints.value.other?.map((o: string, i: number) => (
                  <Constraint key={i} icon="📌" label="Autre contrainte" value={o} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════ SECTION : POINTS DE VIGILANCE ═══════ */}
      {activeSection === 'vigilance' && (
        <div className="space-y-3">
          {!warnings.length ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-slate-400 text-sm">Aucun point de vigilance détecté.</p>
            </div>
          ) : (
            <>
              {(['eliminatoire', 'critique', 'attention'] as const).map(type => {
                const typeWarnings = warnings.filter((w: WarningPoint) => w.type === type)
                if (!typeWarnings.length) return null
                const config = WARNING_CONFIG[type]

                return (
                  <div key={type}>
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{config.label}</h4>
                    <div className="space-y-2">
                      {typeWarnings.map((w: WarningPoint, i: number) => (
                        <div key={i} className={`border rounded-xl p-4 ${config.bg}`}>
                          <p className={`text-sm font-medium ${config.text}`}>{w.description}</p>
                          {w.source_page && (
                            <p className="text-xs text-slate-500 mt-1">📄 {w.source_page}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <div className="text-sm text-white">{children}</div>
    </div>
  )
}

function Constraint({ icon, label, value, alert }: { icon: string; label: string; value: string; alert?: boolean }) {
  return (
    <div className={`border rounded-xl p-4 ${alert ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}>
      <p className="text-lg mb-1">{icon}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium mt-0.5 ${alert ? 'text-red-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 border-2 border-dashed border-slate-700 rounded-xl">
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  )
}
