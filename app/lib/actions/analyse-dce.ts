'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import { extractFullDCE } from '@/lib/services/dce-extractor'
import { extractTextFromDocument } from '@/lib/services/text-extractor'
import type { ExtractionResult, ExtractedValue } from '@/lib/services/dce-extractor'

// ============================================================
// LANCER L'ANALYSE DCE COMPLÈTE
// ============================================================
export async function launchDceAnalysis(projectId: string, lotId: string, versionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }

  const supabase = await createClient()

  // 1. Marquer l'extraction comme "running"
  await supabase.from('project_extractions').upsert({
    project_id: projectId,
    lot_id: lotId,
    company_id: user.company.id,
    version_id: versionId,
    extraction_status: 'running',
    extracted_at: new Date().toISOString(),
  }, { onConflict: 'lot_id,version_id' })

  // 2. Récupérer les documents de la version
  const { data: documents } = await supabase
    .from('dce_documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('version_id', versionId)
    .eq('company_id', user.company.id)

  if (!documents?.length) {
    await supabase.from('project_extractions').upsert({
      project_id: projectId,
      lot_id: lotId,
      company_id: user.company.id,
      version_id: versionId,
      extraction_status: 'error',
      error_message: 'Aucun document trouvé dans cette version DCE',
    }, { onConflict: 'lot_id,version_id' })
    return { error: 'Aucun document trouvé' }
  }

  // 3. Extraire le texte des documents qui ne l'ont pas encore
  const docsToProcess = []
  for (const doc of documents) {
    let extractedText = doc.extracted_text

    if (!extractedText && doc.file_url) {
      // Extraction du texte
      extractedText = await extractTextFromDocument(doc.file_url, doc.file_name, doc.mime_type)

      // Sauvegarder le texte extrait
      await supabase
        .from('dce_documents')
        .update({
          extracted_text: extractedText,
          extraction_status: 'done',
        })
        .eq('id', doc.id)
    }

    docsToProcess.push({
      id: doc.id,
      file_name: doc.file_name,
      doc_type: doc.doc_type,
      extracted_text: extractedText,
    })
  }

  // 4. Lancer l'extraction IA
  try {
    const result: ExtractionResult = await extractFullDCE(docsToProcess)

    // 5. Sauvegarder les résultats dans project_extractions
    const { error: saveError } = await supabase
      .from('project_extractions')
      .upsert({
        project_id: projectId,
        lot_id: lotId,
        company_id: user.company.id,
        version_id: versionId,
        extraction_status: 'done',
        extracted_at: new Date().toISOString(),
        dlro: result.dlro,
        visit_info: {
          mandatory: result.visit_mandatory,
          date: result.visit_date,
          contact: result.visit_contact,
          attestation_required: result.visit_attestation_required,
          location: result.visit_location,
          modalities: result.dlro_modalities,
        },
        criteria: result.criteria,
        required_docs: result.required_docs,
        formal_constraints: result.formal_constraints,
        warning_points: result.warning_points,
      }, { onConflict: 'lot_id,version_id' })

    if (saveError) throw new Error(saveError.message)

    // 6. Mettre à jour la DLRO du projet si extraite avec confiance élevée
    if (result.dlro.value && (result.dlro.confidence ?? 0) > 0.7) {
      await supabase
        .from('projects')
        .update({
          dlro: result.dlro.value,
          status: 'analyse',
          visit_mandatory: result.visit_mandatory.value ?? false,
          visit_date: result.visit_date.value ?? null,
          visit_contact: result.visit_contact.value ?? null,
          estimated_amount: result.estimated_amount.value ?? null,
          market_duration: result.market_duration.value ?? null,
        })
        .eq('id', projectId)
        .eq('company_id', user.company.id)
    }

    // 7. Mettre à jour la progression du lot
    await supabase
      .from('lots')
      .update({ progress_analyse: 100, status: 'analyse' })
      .eq('id', lotId)
      .eq('company_id', user.company.id)

    // 8. Audit log
    await supabase.from('audit_logs').insert({
      company_id: user.company.id,
      user_id: user.id,
      action: 'analyse_dce',
      resource_type: 'project',
      resource_id: projectId,
      metadata: { lot_id: lotId, version_id: versionId, sources: result.sources_used },
    })

    revalidatePath(`/projets/${projectId}`)
    return { success: true, result }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'

    await supabase.from('project_extractions').upsert({
      project_id: projectId,
      lot_id: lotId,
      company_id: user.company.id,
      version_id: versionId,
      extraction_status: 'error',
      error_message: msg,
    }, { onConflict: 'lot_id,version_id' })

    return { error: msg }
  }
}

// ============================================================
// VALIDER / CORRIGER UN CHAMP EXTRAIT
// ============================================================
export async function validateExtractedField(
  extractionId: string,
  field: string,
  correctedValue: unknown
) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }

  const supabase = await createClient()

  // Récupérer l'extraction courante
  const { data: extraction } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('id', extractionId)
    .eq('company_id', user.company.id)
    .single()

  if (!extraction) return { error: 'Extraction non trouvée' }

  // Patcher le champ avec la valeur corrigée + marquer comme validé manuellement
  const currentValue = (extraction as any)[field] as ExtractedValue<unknown> | null
  const updated = {
    ...currentValue,
    value: correctedValue,
    confidence: 1.0,         // confiance max après validation humaine
    validated_by_human: true,
  }

  const { error } = await supabase
    .from('project_extractions')
    .update({ [field]: updated })
    .eq('id', extractionId)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  // Si c'est la DLRO, mettre à jour le projet aussi
  if (field === 'dlro' && correctedValue) {
    const { data: extraction2 } = await supabase
      .from('project_extractions')
      .select('project_id')
      .eq('id', extractionId)
      .single()

    if (extraction2) {
      await supabase
        .from('projects')
        .update({ dlro: correctedValue as string })
        .eq('id', extraction2.project_id)
        .eq('company_id', user.company.id)
    }
  }

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// RÉCUPÉRER L'EXTRACTION (avec status)
// ============================================================
export async function getExtraction(projectId: string, lotId: string) {
  const user = await getAuthUser()
  if (!user) return null

  const supabase = await createClient()

  const { data } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('project_id', projectId)
    .eq('lot_id', lotId)
    .eq('company_id', user.company.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data
}

// ============================================================
// RELANCER L'ANALYSE (en cas d'erreur ou mise à jour DCE)
// ============================================================
export async function relaunchAnalysis(projectId: string, lotId: string, versionId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }

  const supabase = await createClient()

  // Reset le statut
  await supabase
    .from('project_extractions')
    .update({ extraction_status: 'pending', error_message: null })
    .eq('project_id', projectId)
    .eq('lot_id', lotId)
    .eq('company_id', user.company.id)

  return launchDceAnalysis(projectId, lotId, versionId)
}
