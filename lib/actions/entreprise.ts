'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import type {
  CompanyCertification,
  CompanyStaff,
  CompanyEquipment,
  CompanyReference,
  CompanyDocument,
} from '@/types/entreprise'

// ============================================================
// HELPERS
// ============================================================
async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

async function logAudit(
  companyId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  resourceName?: string
) {
  const supabase = await createClient()
  await supabase.from('audit_logs').insert({
    company_id: companyId,
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_name: resourceName,
  })
}

// ============================================================
// IDENTITÉ ENTREPRISE
// ============================================================
export async function updateCompanyIdentite(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const updates = {
    name: formData.get('name') as string,
    siret: formData.get('siret') as string || null,
    siren: formData.get('siren') as string || null,
    ape_code: formData.get('ape_code') as string || null,
    legal_form: formData.get('legal_form') as string || null,
    tva_number: formData.get('tva_number') as string || null,
    address: formData.get('address') as string || null,
    city: formData.get('city') as string || null,
    postal_code: formData.get('postal_code') as string || null,
    ao_contact_name: formData.get('ao_contact_name') as string || null,
    ao_contact_role: formData.get('ao_contact_role') as string || null,
    ao_contact_email: formData.get('ao_contact_email') as string || null,
    ao_contact_phone: formData.get('ao_contact_phone') as string || null,
    revenue_n1: formData.get('revenue_n1') ? Number(formData.get('revenue_n1')) : null,
    revenue_n2: formData.get('revenue_n2') ? Number(formData.get('revenue_n2')) : null,
    revenue_n3: formData.get('revenue_n3') ? Number(formData.get('revenue_n3')) : null,
  }

  const { error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'update', 'company', user.company.id, 'Identité entreprise')
  revalidatePath('/entreprise')
  return { success: true }
}

// ============================================================
// CERTIFICATIONS
// ============================================================
export async function createCertification(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('company_certifications')
    .insert({
      company_id: user.company.id,
      name: formData.get('name') as string,
      issuer: formData.get('issuer') as string || null,
      number: formData.get('number') as string || null,
      issued_at: formData.get('issued_at') as string || null,
      expires_at: formData.get('expires_at') as string || null,
      notes: formData.get('notes') as string || null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'create', 'certification', data.id, data.name)
  revalidatePath('/entreprise/capacites')
  return { success: true, data }
}

export async function deleteCertification(id: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_certifications')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'delete', 'certification', id)
  revalidatePath('/entreprise/capacites')
  return { success: true }
}

// ============================================================
// STAFF (MOYENS HUMAINS)
// ============================================================
export async function createStaff(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const qualifications = (formData.get('qualifications') as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const skills = (formData.get('skills') as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const { data, error } = await supabase
    .from('company_staff')
    .insert({
      company_id: user.company.id,
      full_name: formData.get('full_name') as string,
      job_title: formData.get('job_title') as string || null,
      qualifications,
      skills,
      experience_years: formData.get('experience_years') ? Number(formData.get('experience_years')) : null,
      availability: formData.get('availability') as string || null,
      notes: formData.get('notes') as string || null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'create', 'staff', data.id, data.full_name)
  revalidatePath('/entreprise/capacites')
  return { success: true, data }
}

export async function updateStaff(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const qualifications = (formData.get('qualifications') as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const skills = (formData.get('skills') as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const { error } = await supabase
    .from('company_staff')
    .update({
      full_name: formData.get('full_name') as string,
      job_title: formData.get('job_title') as string || null,
      qualifications,
      skills,
      experience_years: formData.get('experience_years') ? Number(formData.get('experience_years')) : null,
      availability: formData.get('availability') as string || null,
      notes: formData.get('notes') as string || null,
    })
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  revalidatePath('/entreprise/capacites')
  return { success: true }
}

export async function deleteStaff(id: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_staff')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'delete', 'staff', id)
  revalidatePath('/entreprise/capacites')
  return { success: true }
}

// ============================================================
// ÉQUIPEMENT (MOYENS TECHNIQUES)
// ============================================================
export async function createEquipment(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('company_equipment')
    .insert({
      company_id: user.company.id,
      name: formData.get('name') as string,
      category: formData.get('category') as string || null,
      brand: formData.get('brand') as string || null,
      model: formData.get('model') as string || null,
      year: formData.get('year') ? Number(formData.get('year')) : null,
      capacity: formData.get('capacity') as string || null,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : 1,
      location: formData.get('location') as string || null,
      conformity_notes: formData.get('conformity_notes') as string || null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'create', 'equipment', data.id, data.name)
  revalidatePath('/entreprise/capacites')
  return { success: true, data }
}

export async function deleteEquipment(id: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_equipment')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  revalidatePath('/entreprise/capacites')
  return { success: true }
}

// ============================================================
// RÉFÉRENCES MARCHÉS
// ============================================================
export async function createReference(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const tags = (formData.get('tags') as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const { data, error } = await supabase
    .from('company_references')
    .insert({
      company_id: user.company.id,
      client_name: formData.get('client_name') as string,
      client_type: formData.get('client_type') as string || null,
      project_name: formData.get('project_name') as string || null,
      description: formData.get('description') as string || null,
      location: formData.get('location') as string || null,
      amount: formData.get('amount') ? Number(formData.get('amount')) : null,
      start_date: formData.get('start_date') as string || null,
      end_date: formData.get('end_date') as string || null,
      role: formData.get('role') as string || null,
      tags,
      contact_name: formData.get('contact_name') as string || null,
      contact_email: formData.get('contact_email') as string || null,
      contact_phone: formData.get('contact_phone') as string || null,
      is_featured: formData.get('is_featured') === 'true',
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'create', 'reference', data.id, data.client_name)
  revalidatePath('/entreprise/references')
  return { success: true, data }
}

export async function deleteReference(id: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_references')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'delete', 'reference', id)
  revalidatePath('/entreprise/references')
  return { success: true }
}

export async function toggleReferenceFeatured(id: string, featured: boolean) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_references')
    .update({ is_featured: featured })
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  revalidatePath('/entreprise/references')
  return { success: true }
}

// ============================================================
// DOCUMENTS (BIBLIOTHÈQUE)
// ============================================================
export async function createDocument(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const tags = (formData.get('tags') as string || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  const expiresAt = formData.get('expires_at') as string || null

  // Calcul du statut initial
  let status: 'valid' | 'expiring_soon' | 'expired' = 'valid'
  if (expiresAt) {
    const exp = new Date(expiresAt)
    const now = new Date()
    const in30 = new Date()
    in30.setDate(in30.getDate() + 30)
    if (exp < now) status = 'expired'
    else if (exp < in30) status = 'expiring_soon'
  }

  const { data, error } = await supabase
    .from('company_documents')
    .insert({
      company_id: user.company.id,
      name: formData.get('name') as string,
      category: formData.get('category') as string || null,
      tags,
      file_name: formData.get('file_name') as string || null,
      issued_at: formData.get('issued_at') as string || null,
      expires_at: expiresAt,
      notes: formData.get('notes') as string || null,
      status,
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'upload', 'document', data.id, data.name)
  revalidatePath('/entreprise/documents')
  return { success: true, data }
}

export async function deleteDocument(id: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('company_documents')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'delete', 'document', id)
  revalidatePath('/entreprise/documents')
  return { success: true }
}

// ============================================================
// SCORE DE COMPLÉTUDE (pour la barre de progression)
// ============================================================
export async function getCompanyProfileScore() {
  const user = await requireAuth()
  const supabase = await createClient()

  const company = user.company
  const companyId = company.id

  // Identité
  const identiteFields = [company.name, company.siret, company.address, company.ao_contact_name, company.ao_contact_email]
  const identiteScore = Math.round((identiteFields.filter(Boolean).length / identiteFields.length) * 100)

  // Finances
  const financeFields = [company.revenue_n1, company.revenue_n2, company.revenue_n3]
  const financesScore = Math.round((financeFields.filter(v => v !== null).length / financeFields.length) * 100)

  // Certifs
  const { count: certifCount } = await supabase
    .from('company_certifications')
    .select('id', { count: 'exact' })
    .eq('company_id', companyId)
    .eq('is_active', true)
  const certifScore = Math.min((certifCount ?? 0) * 25, 100)

  // Staff
  const { count: staffCount } = await supabase
    .from('company_staff')
    .select('id', { count: 'exact' })
    .eq('company_id', companyId)
    .eq('is_active', true)
  const staffScore = Math.min((staffCount ?? 0) * 20, 100)

  // Équipement
  const { count: equipCount } = await supabase
    .from('company_equipment')
    .select('id', { count: 'exact' })
    .eq('company_id', companyId)
  const equipScore = Math.min((equipCount ?? 0) * 20, 100)

  // Références
  const { count: refCount } = await supabase
    .from('company_references')
    .select('id', { count: 'exact' })
    .eq('company_id', companyId)
  const refScore = Math.min((refCount ?? 0) * 20, 100)

  // Documents
  const { count: docCount } = await supabase
    .from('company_documents')
    .select('id', { count: 'exact' })
    .eq('company_id', companyId)
    .neq('status', 'expired')
  const docScore = Math.min((docCount ?? 0) * 15, 100)

  const total = Math.round(
    (identiteScore + financesScore + certifScore + staffScore + equipScore + refScore + docScore) / 7
  )

  return {
    identite: identiteScore,
    capacites_financieres: financesScore,
    certifications: certifScore,
    staff: staffScore,
    equipement: equipScore,
    references: refScore,
    documents: docScore,
    total,
  }
}
