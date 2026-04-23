'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { generateRapportHtml, type RapportData } from '@/lib/services/rapport-generator'
import { buildPackManifest, generatePackIndex } from '@/lib/services/pack-builder'

async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

// ============================================================
// VÉRIFIER QUE L'EXPORT EST AUTORISÉ
// ============================================================
export async function checkExportEligibility(lotId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const [
    { data: blocking },
    { data: lot },
  ] = await Promise.all([
    supabase.from('checklist_items')
      .select('id, name, category')
      .eq('lot_id', lotId)
      .eq('company_id', user.company.id)
      .eq('character', 'obligatoire')
      .in('status', ['manquant', 'perime']),
    supabase.from('lots')
      .select('memoire_validated_at, prix_validated_at, progress_memoire, progress_prix')
      .eq('id', lotId)
      .single(),
  ])

  const blocks: string[] = []

  if (blocking && blocking.length > 0) {
    blocks.push(`${blocking.length} pièce(s) obligatoire(s) manquante(s) ou périmée(s)`)
  }
  if (lot && !lot.memoire_validated_at && (lot.progress_memoire ?? 0) >= 50) {
    blocks.push('Mémoire technique non validé')
  }
  if (lot && !lot.prix_validated_at && (lot.progress_prix ?? 0) >= 50) {
    blocks.push('Offre financière non validée')
  }

  return {
    canExport: blocks.length === 0,
    blocks,
    missingItems: blocking?.map(i => i.name) ?? [],
  }
}

// ============================================================
// GÉNÉRER LE RAPPORT DE CONFORMITÉ HTML
// ============================================================
export async function generateRapportHtmlAction(projectId: string, lotId: string): Promise<string | null> {
  const user = await requireAuth()
  const supabase = await createClient()

  // Récupérer toutes les données
  const [
    { data: project },
    { data: lot },
    { data: extraction },
    { data: checklist },
    { data: memoire },
    { data: prixFichier },
    { data: company },
    { data: profiles },
  ] = await Promise.all([
    supabase.from('projects').select('title, buyer_name').eq('id', projectId).single(),
    supabase.from('lots').select('*').eq('id', lotId).single(),
    supabase.from('project_extractions').select('*').eq('lot_id', lotId).eq('extraction_status', 'done').order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('checklist_items').select('*').eq('lot_id', lotId).eq('company_id', user.company.id).order('display_order'),
    supabase.from('memoires').select('*').eq('lot_id', lotId).eq('company_id', user.company.id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('prix_fichiers').select('*').eq('lot_id', lotId).eq('company_id', user.company.id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('companies').select('*').eq('id', user.company.id).single(),
    supabase.from('profiles').select('id, full_name').eq('company_id', user.company.id),
  ])

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]))

  // Construire les validations
  const validations: RapportData['validations'] = []
  if (lot?.memoire_validated_at) {
    validations.push({
      type: 'memoire',
      validated_at: lot.memoire_validated_at,
      validated_by_name: profileMap.get(lot.memoire_validated_by) ?? null,
      notes: (memoire as any)?.validation_notes ?? null,
    })
  }
  if (lot?.prix_validated_at) {
    validations.push({
      type: 'prix',
      validated_at: lot.prix_validated_at,
      validated_by_name: profileMap.get(lot.prix_validated_by) ?? null,
      notes: (prixFichier as any)?.validation_notes ?? null,
    })
  }

  // Éléments "Non précisé"
  const notSpecifiedItems: RapportData['not_specified_items'] = []
  const ext = extraction as any
  if (ext?.dlro?.not_specified) notSpecifiedItems.push({ field: 'DLRO', context: 'Non trouvée dans le RC' })
  if (ext?.visit_info?.mandatory?.not_specified) notSpecifiedItems.push({ field: 'Visite de site', context: 'Information absente du RC' })
  if (ext?.criteria?.not_specified) notSpecifiedItems.push({ field: 'Critères de jugement', context: 'Non précisés dans le RC' })
  if (ext?.formal_constraints?.not_specified) notSpecifiedItems.push({ field: 'Contraintes formelles', context: 'Limites de pages, trames, formats non précisés' })

  // Points de vigilance
  const warningPoints = ext?.warning_points?.value ?? []

  const rapportData: RapportData = {
    project_title: project?.title ?? '',
    lot_title: lot?.title ?? '',
    lot_number: lot?.number ?? 1,
    buyer_name: project?.buyer_name ?? null,
    company_name: company?.name ?? '',
    company_logo_url: company?.logo_url ?? null,
    primary_color: company?.primary_color ?? '#1a56db',
    export_date: new Date().toISOString(),
    dlro: ext?.dlro ?? null,
    visit_info: ext?.visit_info ?? null,
    criteria: ext?.criteria?.value ?? [],
    estimated_amount: ext?.estimated_amount?.value ?? null,
    checklist: (checklist ?? []).map(i => ({
      name: i.name,
      category: i.category,
      character: i.character,
      status: i.status,
      source_ref: i.source_ref,
      document_name: i.document_name,
      validated_at: i.validated_at,
    })),
    validations,
    not_specified_items: notSpecifiedItems,
    warning_points: warningPoints,
  }

  return generateRapportHtml(rapportData)
}

// ============================================================
// GÉNÉRER LE MANIFEST DU PACK
// ============================================================
export async function generatePackManifestAction(projectId: string, lotId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const [
    { data: project },
    { data: lot },
    { data: checklist },
    { data: memoire },
    { data: prixFichier },
    { data: company },
  ] = await Promise.all([
    supabase.from('projects').select('title, buyer_name').eq('id', projectId).single(),
    supabase.from('lots').select('number, title').eq('id', lotId).single(),
    supabase.from('checklist_items').select('*').eq('lot_id', lotId).eq('company_id', user.company.id),
    supabase.from('memoires').select('docx_url, pdf_url, status').eq('lot_id', lotId).eq('company_id', user.company.id).limit(1).single(),
    supabase.from('prix_fichiers').select('file_url, output_file_url, status').eq('lot_id', lotId).eq('company_id', user.company.id).limit(1).single(),
    supabase.from('companies').select('name').eq('id', user.company.id).single(),
  ])

  const manifest = buildPackManifest({
    projectTitle: project?.title ?? '',
    lotTitle: lot?.title ?? '',
    lotNumber: lot?.number ?? 1,
    companyName: company?.name ?? '',
    checklistItems: (checklist ?? []).map(i => ({
      name: i.name,
      category: i.category,
      status: i.status,
      character: i.character,
      document_url: i.document_url,
      document_name: i.document_name,
      linked_output: i.linked_output,
    })),
    memoire: (memoire as any) ?? null,
    prixFichier: (prixFichier as any) ?? null,
  })

  return manifest
}

// ============================================================
// CRÉER L'ENREGISTREMENT D'EXPORT
// ============================================================
export async function createExportRecord(projectId: string, lotId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('exports')
    .insert({
      project_id: projectId,
      lot_id: lotId,
      company_id: user.company.id,
      created_by: user.id,
      export_type: 'pack',
      status: 'generating',
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await supabase.from('audit_logs').insert({
    company_id: user.company.id,
    user_id: user.id,
    action: 'export',
    resource_type: 'pack',
    resource_id: data.id,
    metadata: { project_id: projectId, lot_id: lotId },
  })

  return { success: true, exportId: data.id }
}

// ============================================================
// FINALISER L'EXPORT (après génération côté client)
// ============================================================
export async function finalizeExport(exportId: string, manifest: any) {
  const user = await requireAuth()
  const supabase = await createClient()

  await supabase
    .from('exports')
    .update({
      status: 'ready',
      manifest,
      generated_at: new Date().toISOString(),
    })
    .eq('id', exportId)
    .eq('company_id', user.company.id)

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// RÉCUPÉRER L'HISTORIQUE DES EXPORTS
// ============================================================
export async function getExportsHistory(projectId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data } = await supabase
    .from('exports')
    .select('*')
    .eq('project_id', projectId)
    .eq('company_id', user.company.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return data ?? []
}
