export type DocumentStatus = 'valid' | 'expiring_soon' | 'expired' | 'missing'

export interface CompanyCertification {
  id: string
  company_id: string
  name: string
  issuer: string | null
  number: string | null
  issued_at: string | null
  expires_at: string | null
  document_url: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanyStaff {
  id: string
  company_id: string
  full_name: string
  job_title: string | null
  qualifications: string[]
  skills: string[]
  experience_years: number | null
  availability: string | null
  cv_url: string | null
  photo_url: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanyEquipment {
  id: string
  company_id: string
  name: string
  category: string | null
  brand: string | null
  model: string | null
  year: number | null
  capacity: string | null
  quantity: number
  location: string | null
  conformity_notes: string | null
  document_url: string | null
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface CompanyReference {
  id: string
  company_id: string
  client_name: string
  client_type: string | null
  project_name: string | null
  description: string | null
  location: string | null
  amount: number | null
  start_date: string | null
  end_date: string | null
  role: string | null
  tags: string[]
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  document_urls: string[]
  is_featured: boolean
  created_at: string
  updated_at: string
}

export interface CompanyDocument {
  id: string
  company_id: string
  name: string
  category: string | null
  tags: string[]
  file_url: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  issued_at: string | null
  expires_at: string | null
  version: number
  replaced_by: string | null
  status: DocumentStatus
  notes: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

// Résumé de complétude du profil entreprise
export interface CompanyProfileScore {
  identite: number        // 0-100
  capacites_financieres: number
  certifications: number
  staff: number
  equipement: number
  references: number
  documents: number
  total: number
}

// Catégories de documents prédéfinies
export const DOCUMENT_CATEGORIES = [
  { value: 'administratif', label: 'Administratif', docs: ['Kbis', 'Statuts', 'Pouvoir signataire'] },
  { value: 'financier', label: 'Financier', docs: ['Bilan N-1', 'Bilan N-2', 'Bilan N-3', 'Attestation fiscale'] },
  { value: 'assurance', label: 'Assurance', docs: ['RC Professionnelle', 'Décennale', 'RC Exploitation'] },
  { value: 'social', label: 'Social / URSSAF', docs: ['Attestation URSSAF', 'Attestation congés payés'] },
  { value: 'certification', label: 'Certification', docs: ['Qualibat', 'RGE', 'ISO', 'MASE'] },
  { value: 'autre', label: 'Autre', docs: [] },
] as const

export const CERTIFICATION_TYPES = [
  'Qualibat', 'RGE', 'ISO 9001', 'ISO 14001', 'MASE',
  'OPQIBI', 'QUALIEAU', 'APSAD', 'Autre',
] as const
