export type ProjectStatus =
  | 'sourcing' | 'analyse' | 'redaction' | 'validation'
  | 'depose' | 'en_attente' | 'gagne' | 'perdu' | 'abandon'

export type LotStatus = 'nouveau' | 'analyse' | 'redaction' | 'validation' | 'exporte' | 'depose'

export type DceDocType =
  | 'RC' | 'CCAP' | 'CCTP' | 'AE'
  | 'DPGF' | 'BPU' | 'DQE'
  | 'DC1' | 'DC2'
  | 'ANNEXE_ADMIN' | 'ANNEXE_TECH'
  | 'PLAN' | 'CHARTE' | 'AUTRE'

export type DocScope = 'commun' | 'lot'

export interface Project {
  id: string
  company_id: string
  created_by: string | null
  title: string
  reference: string | null
  buyer_name: string | null
  buyer_siren: string | null
  source_url: string | null
  cpv_codes: string[]
  location: string | null
  dlro: string | null
  visit_date: string | null
  visit_mandatory: boolean
  visit_contact: string | null
  estimated_amount: number | null
  market_duration: string | null
  status: ProjectStatus
  is_allotted: boolean
  result_status: string | null
  result_date: string | null
  result_notes: string | null
  created_at: string
  updated_at: string
  // Joins
  lots?: Lot[]
}

export interface Lot {
  id: string
  project_id: string
  company_id: string
  number: number
  title: string
  description: string | null
  status: LotStatus
  progress_analyse: number
  progress_memoire: number
  progress_admin: number
  progress_prix: number
  memoire_validated_at: string | null
  admin_validated_at: string | null
  prix_validated_at: string | null
  created_at: string
  updated_at: string
}

export interface DceDocumentVersion {
  id: string
  project_id: string
  company_id: string
  version: number
  label: string | null
  notes: string | null
  uploaded_by: string | null
  created_at: string
}

export interface DceDocument {
  id: string
  project_id: string
  company_id: string
  version_id: string | null
  lot_id: string | null
  file_name: string
  file_url: string | null
  file_size: number | null
  mime_type: string | null
  page_count: number | null
  doc_type: DceDocType
  scope: DocScope
  classification_confidence: number | null
  classification_validated: boolean
  extracted_text: string | null
  extraction_status: string
  tags: string[]
  custom_label: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Labels et couleurs pour l'UI
export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bg: string; dot: string }> = {
  sourcing:    { label: 'Sourcing',      color: 'text-slate-300',  bg: 'bg-slate-700/50',    dot: 'bg-slate-400' },
  analyse:     { label: 'Analyse DCE',   color: 'text-blue-300',   bg: 'bg-blue-600/10',     dot: 'bg-blue-400' },
  redaction:   { label: 'Rédaction',     color: 'text-purple-300', bg: 'bg-purple-600/10',   dot: 'bg-purple-400' },
  validation:  { label: 'Validation',    color: 'text-amber-300',  bg: 'bg-amber-600/10',    dot: 'bg-amber-400' },
  depose:      { label: 'Déposé',        color: 'text-cyan-300',   bg: 'bg-cyan-600/10',     dot: 'bg-cyan-400' },
  en_attente:  { label: 'En attente',    color: 'text-indigo-300', bg: 'bg-indigo-600/10',   dot: 'bg-indigo-400' },
  gagne:       { label: 'Gagné ✓',       color: 'text-green-300',  bg: 'bg-green-600/10',    dot: 'bg-green-400' },
  perdu:       { label: 'Perdu',         color: 'text-red-300',    bg: 'bg-red-600/10',      dot: 'bg-red-400' },
  abandon:     { label: 'Abandonné',     color: 'text-slate-500',  bg: 'bg-slate-800/50',    dot: 'bg-slate-600' },
}

export const DCE_DOC_TYPE_CONFIG: Record<DceDocType, { label: string; color: string; priority: number }> = {
  RC:           { label: 'RC',            color: 'text-red-300 bg-red-500/10 border-red-500/20',         priority: 1 },
  CCAP:         { label: 'CCAP',          color: 'text-orange-300 bg-orange-500/10 border-orange-500/20', priority: 2 },
  CCTP:         { label: 'CCTP',          color: 'text-amber-300 bg-amber-500/10 border-amber-500/20',    priority: 3 },
  AE:           { label: 'AE',            color: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20', priority: 4 },
  DPGF:         { label: 'DPGF',          color: 'text-green-300 bg-green-500/10 border-green-500/20',    priority: 5 },
  BPU:          { label: 'BPU',           color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', priority: 6 },
  DQE:          { label: 'DQE',           color: 'text-teal-300 bg-teal-500/10 border-teal-500/20',       priority: 7 },
  DC1:          { label: 'DC1',           color: 'text-blue-300 bg-blue-500/10 border-blue-500/20',       priority: 8 },
  DC2:          { label: 'DC2',           color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20', priority: 9 },
  ANNEXE_ADMIN: { label: 'Annexe Admin',  color: 'text-purple-300 bg-purple-500/10 border-purple-500/20', priority: 10 },
  ANNEXE_TECH:  { label: 'Annexe Tech',   color: 'text-violet-300 bg-violet-500/10 border-violet-500/20', priority: 11 },
  PLAN:         { label: 'Plan',          color: 'text-pink-300 bg-pink-500/10 border-pink-500/20',       priority: 12 },
  CHARTE:       { label: 'Charte',        color: 'text-rose-300 bg-rose-500/10 border-rose-500/20',       priority: 13 },
  AUTRE:        { label: 'Autre',         color: 'text-slate-300 bg-slate-500/10 border-slate-500/20',    priority: 14 },
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function getDlroUrgency(dlro: string | null): 'danger' | 'warning' | 'ok' | null {
  if (!dlro) return null
  const diff = new Date(dlro).getTime() - Date.now()
  const days = diff / 86400000
  if (days < 0) return null
  if (days <= 3) return 'danger'
  if (days <= 10) return 'warning'
  return 'ok'
}
