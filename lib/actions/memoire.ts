'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { generateMemorePlan, generateSection } from '@/lib/services/memoire-ai'
import { buildDocxPayload, generateHtmlPreview, type DocxOptions } from '@/lib/services/docx-generator'

async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

// ============================================================
// CRÉER OU RÉCUPÉRER LE MÉMOIRE D'UN LOT
// ============================================================
export async function getOrCreateMemoire(projectId: string, lotId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Chercher un mémoire existant
  const { data: existing } = await supabase
    .from('memoires')
    .select('*, memoire_sections(*)')
    .eq('lot_id', lotId)
    .eq('company_id', user.company.id)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  if (existing) return { memoire: existing, isNew: false }

  // Récupérer infos pour le titre
  const { data: lot } = await supabase.from('lots').select('*, projects(title, buyer_name)').eq('id', lotId).single()

  // Créer un nouveau mémoire
  const { data: newMemoire, error } = await supabase
    .from('memoires')
    .insert({
      project_id: projectId,
      lot_id: lotId,
      company_id: user.company.id,
      title: `Mémoire technique — ${(lot as any)?.projects?.title ?? ''} — Lot ${lot?.number}`,
      version: 1,
      status: 'brouillon',
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { memoire: { ...newMemoire, memoire_sections: [] }, isNew: true }
}

// ============================================================
// GÉNÉRER LE PLAN DU MÉMOIRE (depuis critères DCE)
// ============================================================
export async function generateMemoirePlan(memoireId: string, lotId: string, projectId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Récupérer extraction DCE
  const { data: extraction } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('lot_id', lotId)
    .eq('extraction_status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Récupérer infos projet + lot
  const { data: lot } = await supabase
    .from('lots')
    .select('*, projects(title, buyer_name)')
    .eq('id', lotId)
    .single()

  const criteria = extraction?.criteria?.value ?? []
  const formalConstraints = extraction?.formal_constraints?.value ?? {}
  const pageLimit = formalConstraints.page_limit ?? null

  // Générer le plan via IA
  const plan = await generateMemorePlan({
    projectTitle: (lot as any)?.projects?.title ?? 'Marché',
    buyerName: (lot as any)?.projects?.buyer_name ?? null,
    lotTitle: lot?.title ?? 'Lot',
    criteria,
    formalConstraints,
    pageLimit,
  })

  // Supprimer les sections existantes
  await supabase.from('memoire_sections').delete().eq('memoire_id', memoireId).eq('company_id', user.company.id)

  // Insérer les nouvelles sections
  const { error } = await supabase
    .from('memoire_sections')
    .insert(plan.map(s => ({
      memoire_id: memoireId,
      company_id: user.company.id,
      display_order: s.order,
      level: s.level,
      heading: s.heading,
      section_type: s.section_type,
      criterion_name: s.criterion_name ?? null,
      criterion_weight: s.criterion_weight ?? null,
      status: 'vide',
    })))

  if (error) return { error: error.message }

  // Mettre à jour page_limit sur le mémoire
  await supabase
    .from('memoires')
    .update({ page_limit: pageLimit, has_template: formalConstraints.required_template ?? false })
    .eq('id', memoireId)

  revalidatePath(`/projets/${projectId}/memoire`)
  return { success: true, sectionsCount: plan.length }
}

// ============================================================
// GÉNÉRER LE CONTENU D'UNE SECTION (IA)
// ============================================================
export async function generateSectionContent(sectionId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Récupérer la section
  const { data: section } = await supabase
    .from('memoire_sections')
    .select('*, memoires(*, lots(*, projects(*)))')
    .eq('id', sectionId)
    .eq('company_id', user.company.id)
    .single()

  if (!section) return { error: 'Section non trouvée' }

  const memoire = (section as any).memoires
  const lot = memoire?.lots
  const project = lot?.projects

  // Récupérer données entreprise
  const [
    { data: company },
    { data: certifications },
    { data: staff },
    { data: equipment },
    { data: references },
  ] = await Promise.all([
    supabase.from('companies').select('*').eq('id', user.company.id).single(),
    supabase.from('company_certifications').select('*').eq('company_id', user.company.id).eq('is_active', true),
    supabase.from('company_staff').select('*').eq('company_id', user.company.id).eq('is_active', true),
    supabase.from('company_equipment').select('*').eq('company_id', user.company.id).eq('is_available', true),
    supabase.from('company_references').select('*').eq('company_id', user.company.id).order('is_featured', { ascending: false }),
  ])

  // Récupérer extraction DCE pour contexte
  const { data: extraction } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('lot_id', lot?.id)
    .eq('extraction_status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Récupérer texte CCTP si disponible
  const { data: cctpDoc } = await supabase
    .from('dce_documents')
    .select('extracted_text')
    .eq('project_id', project?.id)
    .eq('doc_type', 'CCTP')
    .limit(1)
    .single()

  // Marquer comme en cours de génération
  await supabase
    .from('memoire_sections')
    .update({ status: 'vide', ai_generated_at: null })
    .eq('id', sectionId)

  // Générer le contenu
  const result = await generateSection({
    section: {
      order: section.display_order,
      level: section.level,
      heading: section.heading,
      section_type: section.section_type as any,
      criterion_name: section.criterion_name ?? undefined,
      criterion_weight: section.criterion_weight ?? undefined,
    },
    projectTitle: project?.title ?? 'Marché',
    buyerName: project?.buyer_name ?? null,
    lotTitle: lot?.title ?? 'Lot',
    lotNumber: lot?.number ?? 1,
    companyName: company?.name ?? user.company.name,
    companyData: {
      address: company?.address,
      siret: company?.siret,
      ao_contact_name: company?.ao_contact_name,
      ao_contact_email: company?.ao_contact_email,
      ao_contact_phone: company?.ao_contact_phone,
      revenue_n1: company?.revenue_n1,
    },
    certifications: certifications ?? [],
    staff: staff ?? [],
    equipment: equipment ?? [],
    references: references ?? [],
    cctp_extract: cctpDoc?.extracted_text ?? undefined,
    criteria: extraction?.criteria?.value ?? [],
    warningPoints: extraction?.warning_points?.value ?? [],
  })

  // Sauvegarder
  await supabase
    .from('memoire_sections')
    .update({
      content: result.content,
      status: result.status,
      word_count: result.word_count,
      ai_generated_at: new Date().toISOString(),
    })
    .eq('id', sectionId)

  revalidatePath(`/projets/${project?.id}/memoire`)
  return { success: true, status: result.status, has_missing: result.has_missing }
}

// ============================================================
// GÉNÉRER TOUTES LES SECTIONS EN BATCH
// ============================================================
export async function generateAllSections(memoireId: string, projectId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: sections } = await supabase
    .from('memoire_sections')
    .select('id, section_type')
    .eq('memoire_id', memoireId)
    .eq('company_id', user.company.id)
    .order('display_order')

  if (!sections?.length) return { error: 'Aucune section trouvée' }

  // Générer en séquence (éviter rate limit + conserver la cohérence)
  let generated = 0
  let missing = 0

  for (const section of sections) {
    if (section.section_type === 'toc') continue
    const result = await generateSectionContent(section.id)
    if (result?.success) {
      generated++
      if (result.has_missing) missing++
    }
  }

  // Mettre à jour progression du lot
  const { data: memoire } = await supabase
    .from('memoires')
    .select('lot_id')
    .eq('id', memoireId)
    .single()

  if (memoire) {
    const progress = Math.round((generated / sections.length) * 100)
    await supabase.from('lots').update({ progress_memoire: progress }).eq('id', memoire.lot_id).eq('company_id', user.company.id)
  }

  revalidatePath(`/projets/${projectId}/memoire`)
  return { success: true, generated, missing }
}

// ============================================================
// ÉDITER LE CONTENU D'UNE SECTION (manuellement)
// ============================================================
export async function updateSectionContent(sectionId: string, content: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const wordCount = content.split(/\s+/).filter(Boolean).length
  const hasMissing = content.includes('Non précisé dans les documents')

  await supabase
    .from('memoire_sections')
    .update({
      content,
      word_count: wordCount,
      status: hasMissing ? 'a_completer' : 'valide',
    })
    .eq('id', sectionId)
    .eq('company_id', user.company.id)

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// VALIDER UNE SECTION
// ============================================================
export async function validateSection(sectionId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  await supabase
    .from('memoire_sections')
    .update({ status: 'valide' })
    .eq('id', sectionId)
    .eq('company_id', user.company.id)

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// SOUMETTRE LE MÉMOIRE POUR VALIDATION
// ============================================================
export async function submitMemoireForValidation(memoireId: string, projectId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Vérifier qu'il n'y a plus de sections "a_completer"
  const { data: incomplete } = await supabase
    .from('memoire_sections')
    .select('id')
    .eq('memoire_id', memoireId)
    .eq('status', 'a_completer')

  if (incomplete && incomplete.length > 0) {
    return { error: `${incomplete.length} section(s) contiennent des informations manquantes à compléter avant de soumettre.` }
  }

  await supabase
    .from('memoires')
    .update({
      status: 'a_valider',
      submitted_for_validation_at: new Date().toISOString(),
      submitted_by: user.id,
    })
    .eq('id', memoireId)
    .eq('company_id', user.company.id)

  // Mettre à jour checklist
  const { data: memoire } = await supabase.from('memoires').select('lot_id').eq('id', memoireId).single()
  if (memoire) {
    await supabase
      .from('checklist_items')
      .update({ status: 'fourni', validated_at: new Date().toISOString(), validated_by: user.id })
      .eq('lot_id', memoire.lot_id)
      .eq('company_id', user.company.id)
      .eq('linked_output', 'memoire')
  }

  revalidatePath(`/projets/${projectId}/memoire`)
  return { success: true }
}

// ============================================================
// VALIDER LE MÉMOIRE (rôle admin/relecteur)
// ============================================================
export async function validateMemoire(memoireId: string, projectId: string, notes?: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  await supabase
    .from('memoires')
    .update({
      status: 'valide',
      validated_at: new Date().toISOString(),
      validated_by: user.id,
      validation_notes: notes ?? null,
    })
    .eq('id', memoireId)
    .eq('company_id', user.company.id)

  // Mettre à jour progression lot
  const { data: memoire } = await supabase.from('memoires').select('lot_id').eq('id', memoireId).single()
  if (memoire) {
    await supabase.from('lots').update({ progress_memoire: 100, memoire_validated_at: new Date().toISOString(), memoire_validated_by: user.id }).eq('id', memoire.lot_id).eq('company_id', user.company.id)
  }

  await supabase.from('audit_logs').insert({
    company_id: user.company.id,
    user_id: user.id,
    action: 'validate_memoire',
    resource_type: 'memoire',
    resource_id: memoireId,
    metadata: { notes },
  })

  revalidatePath(`/projets/${projectId}/memoire`)
  return { success: true }
}

// ============================================================
// GÉNÉRER LA PREVIEW HTML DU MÉMOIRE
// ============================================================
export async function getMemoireHtmlPreview(memoireId: string): Promise<string | null> {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: memoire } = await supabase
    .from('memoires')
    .select('*, memoire_sections(*), lots(*, projects(title, buyer_name))')
    .eq('id', memoireId)
    .eq('company_id', user.company.id)
    .single()

  if (!memoire) return null

  const { data: company } = await supabase.from('companies').select('*').eq('id', user.company.id).single()

  const sections = ((memoire as any).memoire_sections ?? [])
    .sort((a: any, b: any) => a.display_order - b.display_order)

  const options: DocxOptions = {
    title: memoire.title,
    lotTitle: (memoire as any).lots?.title ?? '',
    buyerName: (memoire as any).lots?.projects?.buyer_name ?? null,
    companyName: company?.name ?? '',
    logoUrl: company?.logo_url ?? null,
    primaryColor: company?.primary_color ?? '#1a56db',
    secondaryColor: company?.secondary_color ?? '#7e3af2',
    pageLimit: memoire.page_limit,
    sections: sections.map((s: any) => ({
      heading: s.heading,
      level: s.level,
      section_type: s.section_type,
      content: s.content ?? '',
      criterion_weight: s.criterion_weight,
    })),
  }

  return generateHtmlPreview(options)
}
