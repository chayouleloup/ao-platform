'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { generateChecklistItems } from '@/lib/services/checklist-generator'
import type { ChecklistStatus } from '@/types/conformite'

async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

// ============================================================
// GÉNÉRER LA CHECKLIST DEPUIS L'EXTRACTION DCE
// ============================================================
export async function generateChecklist(projectId: string, lotId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Récupérer le lot
  const { data: lot } = await supabase
    .from('lots')
    .select('*, projects(is_allotted)')
    .eq('id', lotId)
    .single()

  if (!lot) return { error: 'Lot non trouvé' }

  // Récupérer l'extraction DCE la plus récente pour ce lot
  const { data: extraction } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('project_id', projectId)
    .eq('lot_id', lotId)
    .eq('extraction_status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Options depuis l'extraction
  const visitInfo = extraction?.visit_info ?? {}
  const options = {
    hasVisit: visitInfo.mandatory?.value !== false,
    visitMandatory: visitInfo.mandatory?.value === true,
    visitAttestationRequired: visitInfo.attestation_required?.value === true,
    isAllotted: (lot as any).projects?.is_allotted ?? false,
  }

  // Générer les items
  const items = generateChecklistItems(extraction, lot.number, options)

  // Supprimer les anciens items générés par IA/template (garder les manuels)
  await supabase
    .from('checklist_items')
    .delete()
    .eq('lot_id', lotId)
    .eq('company_id', user.company.id)
    .in('source_type', ['ia', 'template'])

  // Insérer les nouveaux
  if (items.length > 0) {
    const { error } = await supabase
      .from('checklist_items')
      .insert(
        items.map(item => ({
          ...item,
          project_id: projectId,
          lot_id: lotId,
          company_id: user.company.id,
        }))
      )

    if (error) return { error: error.message }
  }

  // Mettre à jour la progression du lot
  await updateLotConformiteProgress(lotId, user.company.id)

  await supabase.from('audit_logs').insert({
    company_id: user.company.id,
    user_id: user.id,
    action: 'generate_checklist',
    resource_type: 'lot',
    resource_id: lotId,
    metadata: { items_count: items.length, project_id: projectId },
  })

  revalidatePath(`/projets/${projectId}/conformite`)
  return { success: true, count: items.length }
}

// ============================================================
// AJOUTER UN ITEM MANUELLEMENT
// ============================================================
export async function addChecklistItem(lotId: string, projectId: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('checklist_items')
    .insert({
      project_id: projectId,
      lot_id: lotId,
      company_id: user.company.id,
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      character: formData.get('character') as string,
      scope: formData.get('scope') as string || 'lot',
      source_type: 'manuel',
      source_ref: formData.get('source_ref') as string || null,
      expected_format: formData.get('expected_format') as string || null,
      format_notes: formData.get('format_notes') as string || null,
      display_order: 999,
    })

  if (error) return { error: error.message }

  await updateLotConformiteProgress(lotId, user.company.id)
  revalidatePath(`/projets/${projectId}/conformite`)
  return { success: true }
}

// ============================================================
// CHANGER LE STATUT D'UN ITEM
// ============================================================
export async function updateItemStatus(
  itemId: string,
  status: ChecklistStatus,
  notes?: string,
  overrideReason?: string
) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('checklist_items')
    .select('lot_id, project_id')
    .eq('id', itemId)
    .eq('company_id', user.company.id)
    .single()

  if (!item) return { error: 'Item non trouvé' }

  const updates: any = {
    status,
    status_notes: notes ?? null,
  }

  if (status === 'non_applicable') {
    updates.override_reason = overrideReason ?? null
    updates.validated_by = user.id
    updates.validated_at = new Date().toISOString()
  }

  if (status === 'fourni') {
    updates.validated_by = user.id
    updates.validated_at = new Date().toISOString()
  }

  await supabase.from('checklist_items').update(updates).eq('id', itemId).eq('company_id', user.company.id)

  await updateLotConformiteProgress(item.lot_id, user.company.id)
  revalidatePath(`/projets/${item.project_id}/conformite`)
  return { success: true }
}

// ============================================================
// ENREGISTRER UN UPLOAD POUR UN ITEM
// ============================================================
export async function registerItemUpload(params: {
  itemId: string
  fileName: string
  fileUrl: string
  fileSize: number
  mimeType: string
  expiresAt?: string
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Récupérer l'item
  const { data: item } = await supabase
    .from('checklist_items')
    .select('lot_id, project_id, document_expires_at')
    .eq('id', params.itemId)
    .eq('company_id', user.company.id)
    .single()

  if (!item) return { error: 'Item non trouvé' }

  // Enregistrer l'upload
  await supabase.from('checklist_uploads').insert({
    item_id: params.itemId,
    company_id: user.company.id,
    file_name: params.fileName,
    file_url: params.fileUrl,
    file_size: params.fileSize,
    mime_type: params.mimeType,
    uploaded_by: user.id,
    expires_at: params.expiresAt ?? null,
  })

  // Calculer le statut selon la date d'expiration
  let newStatus: ChecklistStatus = 'fourni'
  if (params.expiresAt) {
    const exp = new Date(params.expiresAt)
    if (exp < new Date()) newStatus = 'perime'
  }

  // Mettre à jour l'item
  await supabase.from('checklist_items').update({
    status: newStatus,
    document_url: params.fileUrl,
    document_name: params.fileName,
    document_expires_at: params.expiresAt ?? null,
    validated_by: user.id,
    validated_at: new Date().toISOString(),
  }).eq('id', params.itemId).eq('company_id', user.company.id)

  await updateLotConformiteProgress(item.lot_id, user.company.id)
  revalidatePath(`/projets/${item.project_id}/conformite`)
  return { success: true, status: newStatus }
}

// ============================================================
// MARQUER UN LIVRABLE INTERNE COMME GÉNÉRÉ/VALIDÉ
// ============================================================
export async function markLinkedOutputReady(lotId: string, outputType: string, projectId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  await supabase
    .from('checklist_items')
    .update({
      status: 'fourni',
      validated_by: user.id,
      validated_at: new Date().toISOString(),
      status_notes: 'Généré via la plateforme',
    })
    .eq('lot_id', lotId)
    .eq('company_id', user.company.id)
    .eq('linked_output', outputType)

  await updateLotConformiteProgress(lotId, user.company.id)
  revalidatePath(`/projets/${projectId}/conformite`)
  return { success: true }
}

// ============================================================
// SUPPRIMER UN ITEM MANUEL
// ============================================================
export async function deleteChecklistItem(itemId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('checklist_items')
    .select('lot_id, project_id, source_type')
    .eq('id', itemId)
    .single()

  if (!item || item.source_type !== 'manuel') {
    return { error: 'Seuls les items ajoutés manuellement peuvent être supprimés' }
  }

  await supabase.from('checklist_items').delete().eq('id', itemId).eq('company_id', user.company.id)

  await updateLotConformiteProgress(item.lot_id, user.company.id)
  revalidatePath(`/projets/${item.project_id}/conformite`)
  return { success: true }
}

// ============================================================
// VÉRIFIER LES BLOCAGES D'EXPORT
// ============================================================
export async function checkExportBlocks(lotId: string): Promise<{
  canExportPack: boolean
  canExportMemoire: boolean
  canExportPrix: boolean
  blocks: Array<{ type: string; reason: string; count: number }>
}> {
  const user = await requireAuth()
  const supabase = await createClient()

  // Items obligatoires manquants ou périmés
  const { data: blocking } = await supabase
    .from('checklist_items')
    .select('id, name, status, category')
    .eq('lot_id', lotId)
    .eq('company_id', user.company.id)
    .eq('character', 'obligatoire')
    .in('status', ['manquant', 'perime'])

  // État du lot (validations)
  const { data: lot } = await supabase
    .from('lots')
    .select('memoire_validated_at, prix_validated_at, admin_validated_at, progress_memoire, progress_prix')
    .eq('id', lotId)
    .single()

  const blocks: Array<{ type: string; reason: string; count: number }> = []

  // Blocage pack : pièces obligatoires manquantes
  const packBlocking = blocking?.filter(i =>
    ['candidature', 'offre_technique', 'offre_financiere'].includes(i.category)
  ) ?? []

  if (packBlocking.length > 0) {
    blocks.push({
      type: 'pack',
      reason: `${packBlocking.length} pièce${packBlocking.length > 1 ? 's' : ''} obligatoire${packBlocking.length > 1 ? 's' : ''} manquante${packBlocking.length > 1 ? 's' : ''} ou périmée${packBlocking.length > 1 ? 's' : ''}`,
      count: packBlocking.length,
    })
  }

  // Blocage mémoire : non validé
  if (lot && !lot.memoire_validated_at && (lot.progress_memoire ?? 0) > 0) {
    blocks.push({ type: 'memoire', reason: 'Mémoire technique non validé', count: 1 })
  }

  // Blocage prix : non validé
  if (lot && !lot.prix_validated_at && (lot.progress_prix ?? 0) > 0) {
    blocks.push({ type: 'prix', reason: 'Offre financière non validée', count: 1 })
  }

  return {
    canExportPack: !blocks.some(b => b.type === 'pack'),
    canExportMemoire: !blocks.some(b => b.type === 'memoire'),
    canExportPrix: !blocks.some(b => b.type === 'prix'),
    blocks,
  }
}

// ============================================================
// HELPER : mise à jour progress_analyse du lot
// ============================================================
async function updateLotConformiteProgress(lotId: string, companyId: string) {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('checklist_items')
    .select('status, character')
    .eq('lot_id', lotId)
    .eq('company_id', companyId)

  if (!items?.length) return

  const total = items.filter(i => i.character !== 'recommande').length
  const done = items.filter(i =>
    i.character !== 'recommande' && ['fourni', 'non_applicable'].includes(i.status)
  ).length

  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  await supabase
    .from('lots')
    .update({ progress_analyse: progress })
    .eq('id', lotId)
    .eq('company_id', companyId)
}
