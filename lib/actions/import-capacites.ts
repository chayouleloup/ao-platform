'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'

export interface ExtractionCapacites {
  name?: string
  siret?: string
  siren?: string
  legal_form?: string
  ape_code?: string
  tva_number?: string
  address?: string
  city?: string
  postal_code?: string
  ao_contact_name?: string
  ao_contact_role?: string
  ao_contact_email?: string
  ao_contact_phone?: string
  revenue_n1?: number
  revenue_n2?: number
  revenue_n3?: number
  certifications?: Array<{ name: string; issuer?: string; number?: string; expires_at?: string }>
  staff?: Array<{ full_name: string; job_title?: string; qualifications?: string[]; experience_years?: number }>
  equipment?: Array<{ name: string; category?: string; capacity?: string; quantity?: number }>
  references?: Array<{ client_name: string; project_name?: string; location?: string; amount?: number; description?: string; tags?: string[] }>
  missing_fields?: string[]
}

export async function extractCapacitesFromPdf(fileUrl: string): Promise<{ success: boolean; data?: ExtractionCapacites; error?: string }> {
  const user = await getAuthUser()
  if (!user) return { success: false, error: 'Non authentifié' }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `Tu es expert en marchés publics français. Tu extrais les informations d'un dossier de capacités. Réponds UNIQUEMENT en JSON valide.`,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'url', url: fileUrl } },
            { type: 'text', text: `Extrais toutes les informations et retourne ce JSON :
{
  "name": "Raison sociale",
  "siret": "14 chiffres",
  "legal_form": "SAS/SARL/etc",
  "ape_code": "code APE",
  "address": "adresse",
  "city": "ville",
  "postal_code": "code postal",
  "ao_contact_name": "nom interlocuteur AO",
  "ao_contact_role": "fonction",
  "ao_contact_email": "email",
  "ao_contact_phone": "téléphone",
  "revenue_n1": 1500000,
  "revenue_n2": 1200000,
  "revenue_n3": 1000000,
  "certifications": [{ "name": "Qualibat", "issuer": "Qualibat", "number": "123", "expires_at": "2025-12-31" }],
  "staff": [{ "full_name": "Jean Dupont", "job_title": "Conducteur travaux", "qualifications": ["CACES"], "experience_years": 10 }],
  "equipment": [{ "name": "Pelle", "category": "Engins", "capacity": "20t", "quantity": 2 }],
  "references": [{ "client_name": "Mairie", "project_name": "Voirie", "location": "Lyon", "amount": 250000, "description": "Travaux", "tags": ["VRD"] }],
  "missing_fields": ["champs importants manquants"]
}` }
          ],
        }],
      }),
    })

    const data = await response.json()
    const text = data.content?.find((c: any) => c.type === 'text')?.text ?? ''
    let extracted: ExtractionCapacites = {}
    try {
      extracted = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())
    } catch {
      return { success: false, error: 'Impossible de lire le document.' }
    }
    return { success: true, data: extracted }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function applyCapacitesExtraction(data: ExtractionCapacites) {
  const user = await getAuthUser()
  if (!user) return { success: false, error: 'Non authentifié' }
  const supabase = await createClient()

  const companyUpdates: any = {}
  if (data.name) companyUpdates.name = data.name
  if (data.siret) companyUpdates.siret = data.siret
  if (data.siren) companyUpdates.siren = data.siren
  if (data.legal_form) companyUpdates.legal_form = data.legal_form
  if (data.ape_code) companyUpdates.ape_code = data.ape_code
  if (data.tva_number) companyUpdates.tva_number = data.tva_number
  if (data.address) companyUpdates.address = data.address
  if (data.city) companyUpdates.city = data.city
  if (data.postal_code) companyUpdates.postal_code = data.postal_code
  if (data.ao_contact_name) companyUpdates.ao_contact_name = data.ao_contact_name
  if (data.ao_contact_role) companyUpdates.ao_contact_role = data.ao_contact_role
  if (data.ao_contact_email) companyUpdates.ao_contact_email = data.ao_contact_email
  if (data.ao_contact_phone) companyUpdates.ao_contact_phone = data.ao_contact_phone
  if (data.revenue_n1) companyUpdates.revenue_n1 = data.revenue_n1
  if (data.revenue_n2) companyUpdates.revenue_n2 = data.revenue_n2
  if (data.revenue_n3) companyUpdates.revenue_n3 = data.revenue_n3

  if (Object.keys(companyUpdates).length > 0) {
    await supabase.from('companies').update(companyUpdates).eq('id', user.company.id)
  }
  if (data.certifications?.length) {
    await supabase.from('company_certifications').insert(
      data.certifications.map(c => ({ company_id: user.company.id, name: c.name, issuer: c.issuer ?? null, number: c.number ?? null, expires_at: c.expires_at ?? null }))
    )
  }
  if (data.staff?.length) {
    await supabase.from('company_staff').insert(
      data.staff.map(s => ({ company_id: user.company.id, full_name: s.full_name, job_title: s.job_title ?? null, qualifications: s.qualifications ?? [], experience_years: s.experience_years ?? null }))
    )
  }
  if (data.equipment?.length) {
    await supabase.from('company_equipment').insert(
      data.equipment.map(e => ({ company_id: user.company.id, name: e.name, category: e.category ?? null, capacity: e.capacity ?? null, quantity: e.quantity ?? 1 }))
    )
  }
  if (data.references?.length) {
    await supabase.from('company_references').insert(
      data.references.map(r => ({ company_id: user.company.id, client_name: r.client_name, project_name: r.project_name ?? null, location: r.location ?? null, amount: r.amount ?? null, description: r.description ?? null, tags: r.tags ?? [] }))
    )
  }

  revalidatePath('/entreprise')
  return { success: true }
}
