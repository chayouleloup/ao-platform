export type ChecklistStatus = 'manquant' | 'fourni' | 'perime' | 'non_applicable'
export type ChecklistCategory = 'candidature' | 'offre_technique' | 'offre_financiere' | 'conditionnel'
export type ItemCharacter = 'obligatoire' | 'conditionnel' | 'recommande'

export interface ChecklistItem {
  id: string
  project_id: string
  lot_id: string
  company_id: string
  name: string
  category: ChecklistCategory
  character: ItemCharacter
  scope: string
  source_type: string
  source_ref: string | null
  dce_doc_type: string | null
  expected_format: string | null
  format_notes: string | null
  status: ChecklistStatus
  status_notes: string | null
  document_id: string | null
  document_url: string | null
  document_name: string | null
  document_expires_at: string | null
  linked_output: string | null
  validated_by: string | null
  validated_at: string | null
  override_reason: string | null
  display_order: number
  created_at: string
  updated_at: string
  // joins
  checklist_uploads?: ChecklistUpload[]
}

export interface ChecklistUpload {
  id: string
  item_id: string
  company_id: string
  file_name: string
  file_url: string | null
  file_size: number | null
  mime_type: string | null
  uploaded_by: string | null
  expires_at: string | null
  created_at: string
}

export interface ExportBlock {
  block_type: 'pack' | 'memoire' | 'prix' | 'admin'
  reason: string
  missing_count: number
}

export interface ChecklistScore {
  total: number
  fourni: number
  manquant: number
  perime: number
  non_applicable: number
  score_pct: number
}

// Config UI par statut
export const STATUS_CONFIG: Record<ChecklistStatus, {
  label: string
  color: string
  bg: string
  border: string
  icon: string
}> = {
  fourni: {
    label: 'Fourni',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/25',
    icon: '✓',
  },
  manquant: {
    label: 'Manquant',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/25',
    icon: '✗',
  },
  perime: {
    label: 'Périmé',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    icon: '⚠',
  },
  non_applicable: {
    label: 'N/A',
    color: 'text-slate-500',
    bg: 'bg-slate-700/30',
    border: 'border-slate-700',
    icon: '—',
  },
}

export const CATEGORY_CONFIG: Record<ChecklistCategory, {
  label: string
  icon: string
  color: string
}> = {
  candidature:      { label: 'Candidature',    icon: '👤', color: 'blue'   },
  offre_technique:  { label: 'Offre technique', icon: '📝', color: 'purple' },
  offre_financiere: { label: 'Offre financière',icon: '💶', color: 'green'  },
  conditionnel:     { label: 'Conditionnel',    icon: '⚙️', color: 'amber'  },
}

export const CHARACTER_CONFIG: Record<ItemCharacter, { label: string; color: string }> = {
  obligatoire:  { label: 'Obligatoire',  color: 'text-red-400'    },
  conditionnel: { label: 'Conditionnel', color: 'text-amber-400'  },
  recommande:   { label: 'Recommandé',   color: 'text-slate-400'  },
}

// Livrables internes liés à un type de checklist
export const LINKED_OUTPUT_MAP: Record<string, string> = {
  'memoire': 'Mémoire technique',
  'ae':      'Acte d\'engagement',
  'dpgf':    'DPGF / BPU / DQE',
  'dc1':     'DC1 prérempli',
  'dc2':     'DC2 prérempli',
}
