'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { mapLignesWithAI, detectAnomalies } from '@/lib/services/dpgf-parser'

async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

// ============================================================
// ENREGISTRER LE FICHIER APRÈS UPLOAD + LANCER LE PARSING
// ============================================================
export async function registerPrixFichier(params: {
  projectId: string
  lotId: string
  fileName: string
  fileUrl: string
  fileSize: number
  docType: string
  parsedLines: Array<{
    sheet_name: string
    row_index: number
    display_order: number
    designation: string | null
    unite: string | null
    quantite: number | null
    pu: number | null
    montant: number | null
    is_section_header: boolean
    is_subtotal: boolean
  }>
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  // 1. Créer le fichier
  const { data: fichier, error: fichierError } = await supabase
    .from('prix_fichiers')
    .insert({
      project_id: params.projectId,
      lot_id: params.lotId,
      company_id: user.company.id,
      file_name: params.fileName,
      file_url: params.fileUrl,
      file_size: params.fileSize,
      doc_type: params.docType,
      status: 'importe',
      lines_count: params.parsedLines.length,
      imported_by: user.id,
    })
    .select()
    .single()

  if (fichierError) return { error: fichierError.message }

  // 2. Insérer les lignes
  if (params.parsedLines.length > 0) {
    const { error: lignesError } = await supabase
      .from('prix_lignes')
      .insert(params.parsedLines.map(l => ({
        ...l,
        fichier_id: fichier.id,
        company_id: user.company.id,
        unite_orig: l.unite,
        quantite_orig: l.quantite,
        pu_orig: l.pu,
        montant_orig: l.montant,
      })))

    if (lignesError) return { error: lignesError.message }
  }

  await supabase.from('audit_logs').insert({
    company_id: user.company.id,
    user_id: user.id,
    action: 'upload',
    resource_type: 'prix_fichier',
    resource_id: fichier.id,
    resource_name: params.fileName,
    metadata: { lines: params.parsedLines.length, doc_type: params.docType },
  })

  revalidatePath(`/projets/${params.projectId}/prix`)
  return { success: true, fichierId: fichier.id }
}

// ============================================================
// LANCER LE MAPPING IA
// ============================================================
export async function launchPrixMapping(fichierId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Marquer comme en cours
  await supabase
    .from('prix_fichiers')
    .update({ status: 'mapping' })
    .eq('id', fichierId)
    .eq('company_id', user.company.id)

  // Récupérer les lignes
  const { data: lignes } = await supabase
    .from('prix_lignes')
    .select('*')
    .eq('fichier_id', fichierId)
    .eq('is_section_header', false)
    .eq('is_subtotal', false)
    .order('display_order')

  if (!lignes?.length) {
    await supabase.from('prix_fichiers').update({ status: 'a_valider' }).eq('id', fichierId)
    return { success: true, mapped: 0 }
  }

  // Récupérer biblio prix client
  const { data: prixClient } = await supabase
    .from('prix_client')
    .select('*')
    .eq('company_id', user.company.id)

  // Récupérer doc_type
  const { data: fichier } = await supabase
    .from('prix_fichiers')
    .select('doc_type')
    .eq('id', fichierId)
    .single()

  // Lancer le mapping IA
  const mappingResults = await mapLignesWithAI(
    lignes.map(l => ({
      id_temp: l.display_order,
      designation: l.designation,
      unite: l.unite,
      quantite: l.quantite,
    })),
    prixClient ?? [],
    fichier?.doc_type ?? 'DPGF'
  )

  // Appliquer les résultats de mapping
  for (const result of mappingResults) {
    const ligne = lignes.find(l => l.display_order === result.ligne_id_temp)
    if (!ligne) continue

    const pu = result.pu_propose
    const quantite = ligne.quantite
    const montant = pu && quantite ? Math.round(pu * quantite * 100) / 100 : null

    await supabase
      .from('prix_lignes')
      .update({
        pu,
        unite: result.unite_propose ?? ligne.unite,
        montant,
        matched_article: result.matched_article,
        matched_source: result.source,
        mapping_confidence: result.confidence,
      })
      .eq('id', ligne.id)
  }

  // Détecter les anomalies
  const lignesAvecMapping = lignes.map(l => {
    const mapping = mappingResults.find(m => m.ligne_id_temp === l.display_order)
    return {
      id_temp: l.display_order,
      designation: l.designation,
      unite: l.unite,
      quantite: l.quantite,
      pu: mapping?.pu_propose ?? l.pu,
      montant: mapping?.pu_propose && l.quantite ? mapping.pu_propose * l.quantite : l.montant,
      mapping_confidence: mapping?.confidence ?? 0,
      is_section_header: l.is_section_header,
      is_subtotal: l.is_subtotal,
    }
  })

  const anomalies = detectAnomalies(lignesAvecMapping, prixClient ?? [])

  // Supprimer les anciennes anomalies automatiques
  await supabase
    .from('prix_anomalies')
    .delete()
    .eq('fichier_id', fichierId)
    .eq('company_id', user.company.id)

  // Insérer les nouvelles
  if (anomalies.length > 0) {
    const ligneIdMap = new Map(lignes.map(l => [l.display_order, l.id]))

    await supabase.from('prix_anomalies').insert(
      anomalies.map(a => ({
        fichier_id: fichierId,
        ligne_id: ligneIdMap.get(a.ligne_index) ?? null,
        company_id: user.company.id,
        anomalie_type: a.type,
        severity: a.severity,
        description: a.description,
        suggestion: a.suggestion,
      }))
    )
  }

  // Recalculer le total et mettre à jour le statut
  await supabase.rpc('recalculate_prix_total', { p_fichier_id: fichierId })
  await supabase
    .from('prix_fichiers')
    .update({ status: 'a_valider' })
    .eq('id', fichierId)

  // Mettre à jour progression lot
  const { data: fich } = await supabase.from('prix_fichiers').select('lot_id').eq('id', fichierId).single()
  if (fich) {
    await supabase.from('lots').update({ progress_prix: 60 }).eq('id', fich.lot_id).eq('company_id', user.company.id)
  }

  revalidatePath('/projets')
  return {
    success: true,
    mapped: mappingResults.filter(r => r.pu_propose !== null).length,
    anomalies: anomalies.length,
    bloquantes: anomalies.filter(a => a.severity === 'bloquante').length,
  }
}

// ============================================================
// METTRE À JOUR UNE LIGNE (PU, unité, notes)
// ============================================================
export async function updatePrixLigne(ligneId: string, updates: {
  pu?: number | null
  unite?: string | null
  quantite?: number | null
  notes?: string | null
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Recalculer le montant si PU ou quantité changé
  const { data: ligne } = await supabase
    .from('prix_lignes')
    .select('quantite, pu, fichier_id')
    .eq('id', ligneId)
    .single()

  if (!ligne) return { error: 'Ligne non trouvée' }

  const newPu = updates.pu !== undefined ? updates.pu : ligne.pu
  const newQte = updates.quantite !== undefined ? updates.quantite : ligne.quantite
  const newMontant = newPu != null && newQte != null
    ? Math.round(newPu * newQte * 100) / 100
    : null

  await supabase
    .from('prix_lignes')
    .update({
      ...updates,
      montant: newMontant,
      mapping_validated: true,
    })
    .eq('id', ligneId)
    .eq('company_id', user.company.id)

  // Recalculer le total du fichier
  await supabase.rpc('recalculate_prix_total', { p_fichier_id: ligne.fichier_id })

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// RÉSOUDRE UNE ANOMALIE
// ============================================================
export async function resolveAnomalie(anomalieId: string, note?: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  await supabase
    .from('prix_anomalies')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolution_note: note ?? 'Accepté',
    })
    .eq('id', anomalieId)
    .eq('company_id', user.company.id)

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// VALIDATION GLOBALE (bouton unique CDC §14.4)
// ============================================================
export async function validatePrixGlobal(fichierId: string, notes?: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Vérifier qu'il n'y a plus d'anomalies BLOQUANTES non résolues
  const { data: bloquantes } = await supabase
    .from('prix_anomalies')
    .select('id, description')
    .eq('fichier_id', fichierId)
    .eq('severity', 'bloquante')
    .eq('resolved', false)
    .eq('company_id', user.company.id)

  if (bloquantes && bloquantes.length > 0) {
    return {
      error: `${bloquantes.length} anomalie(s) bloquante(s) doivent être corrigées ou acceptées avant la validation.`,
      blocking_anomalies: bloquantes,
    }
  }

  // Valider
  await supabase
    .from('prix_fichiers')
    .update({
      status: 'valide',
      validated_at: new Date().toISOString(),
      validated_by: user.id,
      validation_notes: notes ?? null,
    })
    .eq('id', fichierId)
    .eq('company_id', user.company.id)

  // Mettre à jour lot
  const { data: fich } = await supabase
    .from('prix_fichiers')
    .select('lot_id, project_id')
    .eq('id', fichierId)
    .single()

  if (fich) {
    await supabase
      .from('lots')
      .update({
        progress_prix: 100,
        prix_validated_at: new Date().toISOString(),
        prix_validated_by: user.id,
      })
      .eq('id', fich.lot_id)
      .eq('company_id', user.company.id)

    // Mettre à jour la checklist (AE + DPGF)
    await supabase
      .from('checklist_items')
      .update({ status: 'fourni', validated_at: new Date().toISOString(), validated_by: user.id })
      .eq('lot_id', fich.lot_id)
      .eq('company_id', user.company.id)
      .in('linked_output', ['ae', 'dpgf'])
  }

  // Audit
  await supabase.from('audit_logs').insert({
    company_id: user.company.id,
    user_id: user.id,
    action: 'validate_prix',
    resource_type: 'prix_fichier',
    resource_id: fichierId,
    metadata: { notes, resolved_anomalies: true },
  })

  revalidatePath('/projets')
  return { success: true }
}
