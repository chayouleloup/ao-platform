export type PrixStatus = 'importe' | 'mapping' | 'a_valider' | 'valide' | 'exporte'
export type AnomalieSeverity = 'bloquante' | 'attention'
export type AnomalieType =
  | 'unite_incoherente' | 'quantite_aberrante' | 'pu_hors_fourchette'
  | 'doublon' | 'ligne_vide' | 'montant_zero' | 'mapping_incertain'

export interface PrixFichier {
  id: string
  project_id: string
  lot_id: string
  company_id: string
  file_name: string
  file_url: string | null
  file_size: number | null
  doc_type: string
  output_file_url: string | null
  output_file_name: string | null
  status: PrixStatus
  total_ht: number | null
  sheets_count: number
  lines_count: number
  mapped_count: number
  validated_at: string | null
  validated_by: string | null
  validation_notes: string | null
  imported_by: string | null
  created_at: string
  updated_at: string
}

export interface PrixLigne {
  id: string
  fichier_id: string
  company_id: string
  sheet_name: string | null
  row_index: number
  display_order: number
  designation: string | null
  unite_orig: string | null
  quantite_orig: number | null
  pu_orig: number | null
  montant_orig: number | null
  unite: string | null
  quantite: number | null
  pu: number | null
  montant: number | null
  matched_article: string | null
  matched_source: string | null
  mapping_confidence: number | null
  mapping_validated: boolean
  notes: string | null
  is_section_header: boolean
  is_subtotal: boolean
  created_at: string
  updated_at: string
}

export interface PrixAnomalie {
  id: string
  fichier_id: string
  ligne_id: string | null
  company_id: string
  anomalie_type: AnomalieType
  severity: AnomalieSeverity
  description: string
  suggestion: string | null
  resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  created_at: string
}

export interface PrixClient {
  id: string
  company_id: string
  designation: string
  unite: string | null
  pu_min: number | null
  pu_max: number | null
  pu_cible: number | null
  source: string
  tags: string[]
  valid_until: string | null
  created_at: string
}

// Config UI
export const PRIX_STATUS_CONFIG: Record<PrixStatus, { label: string; color: string; bg: string; border: string }> = {
  importe:   { label: 'Importé',         color: 'text-slate-400',  bg: 'bg-slate-700/50',   border: 'border-slate-600' },
  mapping:   { label: 'Mapping IA...',   color: 'text-blue-400',   bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  a_valider: { label: 'À valider',       color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  valide:    { label: 'Validé ✓',        color: 'text-green-400',  bg: 'bg-green-500/10',   border: 'border-green-500/30' },
  exporte:   { label: 'Exporté',         color: 'text-purple-400', bg: 'bg-purple-500/10',  border: 'border-purple-500/30' },
}

export const ANOMALIE_CONFIG: Record<AnomalieType, { label: string; icon: string }> = {
  unite_incoherente:  { label: 'Unité incohérente',       icon: '📐' },
  quantite_aberrante: { label: 'Quantité aberrante',      icon: '🔢' },
  pu_hors_fourchette: { label: 'PU hors fourchette',      icon: '💸' },
  doublon:            { label: 'Doublon détecté',         icon: '⚠️' },
  ligne_vide:         { label: 'Ligne vide',              icon: '◻️' },
  montant_zero:       { label: 'Montant à zéro',          icon: '0️⃣' },
  mapping_incertain:  { label: 'Mapping incertain',       icon: '❓' },
}

export function formatEur(val: number | null | undefined): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(val)
}

export function formatNum(val: number | null | undefined, decimals = 2): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val)
}
