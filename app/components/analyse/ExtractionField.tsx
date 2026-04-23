'use client'

import { useState, useTransition } from 'react'
import { validateExtractedField } from '@/lib/actions/analyse-dce'
import type { ExtractedValue } from '@/lib/services/dce-extractor'

interface Props<T = string> {
  label: string
  field: string
  extractionId: string
  extracted: ExtractedValue<T>
  renderValue?: (v: T) => string
  editType?: 'text' | 'datetime-local' | 'number' | 'boolean'
  className?: string
}

export function ExtractionField<T = string>({
  label,
  field,
  extractionId,
  extracted,
  renderValue,
  editType = 'text',
  className = '',
}: Props<T>) {
  const [isPending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState<string>(
    extracted.value != null ? String(extracted.value) : ''
  )
  const [localValidated, setLocalValidated] = useState(false)

  const confidence = extracted.confidence ?? 0
  const isLow = confidence < 0.65 && !extracted.not_specified
  const isMedium = confidence >= 0.65 && confidence < 0.85
  const isHigh = confidence >= 0.85

  const isValidated = localValidated || (confidence === 1.0 && !isLow)

  function handleSave() {
    let value: unknown = editValue
    if (editType === 'number') value = editValue ? Number(editValue) : null
    if (editType === 'boolean') value = editValue === 'true'

    startTransition(async () => {
      const result = await validateExtractedField(extractionId, field, value)
      if (result?.success) {
        setIsEditing(false)
        setLocalValidated(true)
      }
    })
  }

  const displayValue = extracted.not_specified
    ? null
    : extracted.value != null
      ? renderValue
        ? renderValue(extracted.value)
        : String(extracted.value)
      : null

  return (
    <div className={`group ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1.5">
          {/* Badge confiance */}
          {!extracted.not_specified && extracted.value !== null && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              isValidated
                ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                : isHigh
                  ? 'bg-green-500/10 text-green-400/70'
                  : isMedium
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-red-500/10 text-red-400'
            }`}>
              {isValidated ? '✓ Validé' : `${Math.round(confidence * 100)}%`}
            </span>
          )}
          {/* Bouton éditer */}
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-blue-400 transition-all"
              title="Corriger"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Valeur */}
      {isEditing ? (
        <div className="space-y-2">
          {editType === 'boolean' ? (
            <select
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full bg-slate-800 border border-blue-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          ) : (
            <input
              type={editType}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full bg-slate-800 border border-blue-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder={extracted.not_specified ? 'Saisir la valeur' : undefined}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-1.5 rounded transition-all"
            >
              {isPending ? 'Sauvegarde...' : 'Valider'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium py-1.5 rounded transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div>
          {extracted.not_specified ? (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-slate-600 italic">Non précisé dans les documents.</span>
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Saisir
              </button>
            </div>
          ) : displayValue ? (
            <div>
              <p className={`text-sm font-medium ${
                isLow ? 'text-amber-200' : 'text-white'
              }`}>
                {displayValue}
              </p>
              {/* Source */}
              {extracted.source_doc && (
                <p className="text-[10px] text-slate-600 mt-0.5">
                  Source : {extracted.source_doc}
                  {extracted.source_page && ` · ${extracted.source_page}`}
                </p>
              )}
              {/* Alerte confiance faible */}
              {isLow && !isValidated && (
                <p className="text-[10px] text-amber-400 mt-1">
                  ⚠️ Confiance faible — veuillez vérifier et valider
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">—</p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Badge de confiance global
// ============================================================
export function ConfidenceBadge({ confidence, notSpecified = false }: {
  confidence: number
  notSpecified?: boolean
}) {
  if (notSpecified) return (
    <span className="text-[10px] bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">Non précisé</span>
  )

  if (confidence >= 0.85) return (
    <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">
      Élevée {Math.round(confidence * 100)}%
    </span>
  )
  if (confidence >= 0.65) return (
    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
      Moyenne {Math.round(confidence * 100)}%
    </span>
  )
  return (
    <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
      Faible {Math.round(confidence * 100)}% — À vérifier
    </span>
  )
}
