'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/lib/supabase/server'
import type { DceDocType, DocScope } from '@/types/projet'

// ============================================================
// HELPERS
// ============================================================
async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

async function logAudit(companyId: string, userId: string, action: string, resourceType: string, resourceId?: string, name?: string) {
  const supabase = await createClient()
  await supabase.from('audit_logs').insert({ company_id: companyId, user_id: userId, action, resource_type: resourceType, resource_id: resourceId, resource_name: name })
}

// ============================================================
// PROJETS — CRUD
// ============================================================
export async function createProject(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const isAllotted = formData.get('is_allotted') === 'true'
  const lotsCount = isAllotted ? parseInt(formData.get('lots_count') as string || '1') : 1

  // 1. Créer le projet
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      company_id: user.company.id,
      created_by: user.id,
      title: formData.get('title') as string,
      reference: formData.get('reference') as string || null,
      buyer_name: formData.get('buyer_name') as string || null,
      location: formData.get('location') as string || null,
      dlro: formData.get('dlro') as string || null,
      estimated_amount: formData.get('estimated_amount') ? Number(formData.get('estimated_amount')) : null,
      source_url: formData.get('source_url') as string || null,
      is_allotted: isAllotted,
      status: 'sourcing',
    })
    .select()
    .single()

  if (projectError) return { error: projectError.message }

  // 2. Créer les lots
  const lotsToInsert = []
  if (isAllotted) {
    for (let i = 1; i <= lotsCount; i++) {
      lotsToInsert.push({
        project_id: project.id,
        company_id: user.company.id,
        number: i,
        title: (formData.get(`lot_${i}_title`) as string) || `Lot ${i}`,
        description: formData.get(`lot_${i}_desc`) as string || null,
      })
    }
  } else {
    lotsToInsert.push({
      project_id: project.id,
      company_id: user.company.id,
      number: 1,
      title: 'Marché unique',
    })
  }

  const { error: lotsError } = await supabase.from('lots').insert(lotsToInsert)
  if (lotsError) return { error: lotsError.message }

  await logAudit(user.company.id, user.id, 'create', 'project', project.id, project.title)
  revalidatePath('/projets')

  return { success: true, projectId: project.id }
}

export async function updateProject(id: string, formData: FormData) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .update({
      title: formData.get('title') as string,
      reference: formData.get('reference') as string || null,
      buyer_name: formData.get('buyer_name') as string || null,
      location: formData.get('location') as string || null,
      dlro: formData.get('dlro') as string || null,
      estimated_amount: formData.get('estimated_amount') ? Number(formData.get('estimated_amount')) : null,
      source_url: formData.get('source_url') as string || null,
      visit_mandatory: formData.get('visit_mandatory') === 'true',
      visit_date: formData.get('visit_date') as string || null,
      visit_contact: formData.get('visit_contact') as string || null,
      market_duration: formData.get('market_duration') as string || null,
    })
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  revalidatePath(`/projets/${id}`)
  return { success: true }
}

export async function updateProjectStatus(id: string, status: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'status_change', 'project', id, status)
  revalidatePath(`/projets/${id}`)
  revalidatePath('/projets')
  return { success: true }
}

export async function deleteProject(id: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'delete', 'project', id)
  revalidatePath('/projets')
  redirect('/projets')
}

// ============================================================
// LOTS
// ============================================================
export async function addLot(projectId: string, title: string, description?: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Prochain numéro de lot
  const { data: existing } = await supabase
    .from('lots')
    .select('number')
    .eq('project_id', projectId)
    .order('number', { ascending: false })
    .limit(1)

  const nextNumber = (existing?.[0]?.number ?? 0) + 1

  const { data, error } = await supabase
    .from('lots')
    .insert({
      project_id: projectId,
      company_id: user.company.id,
      number: nextNumber,
      title,
      description: description || null,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/projets/${projectId}`)
  return { success: true, data }
}

// ============================================================
// DCE — UPLOAD + CLASSIFICATION IA
// ============================================================

/**
 * Enregistre les métadonnées d'un fichier uploadé dans Supabase Storage
 * L'upload réel du fichier se fait côté client via le client Supabase browser
 */
export async function registerDceDocument(params: {
  projectId: string
  versionId: string
  fileName: string
  fileUrl: string
  fileSize: number
  mimeType: string
  lotId?: string
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('dce_documents')
    .insert({
      project_id: params.projectId,
      company_id: user.company.id,
      version_id: params.versionId,
      lot_id: params.lotId || null,
      file_name: params.fileName,
      file_url: params.fileUrl,
      file_size: params.fileSize,
      mime_type: params.mimeType,
      doc_type: 'AUTRE',
      scope: 'commun',
      extraction_status: 'pending',
    })
    .select()
    .single()

  if (error) return { error: error.message }

  await logAudit(user.company.id, user.id, 'upload', 'dce_document', data.id, params.fileName)
  revalidatePath(`/projets/${params.projectId}`)

  return { success: true, documentId: data.id }
}

/**
 * Crée une nouvelle version DCE (quand l'acheteur met à jour)
 */
export async function createDceVersion(projectId: string, label: string, notes?: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('dce_document_versions')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = (existing?.[0]?.version ?? 0) + 1

  const { data, error } = await supabase
    .from('dce_document_versions')
    .insert({
      project_id: projectId,
      company_id: user.company.id,
      version: nextVersion,
      label: label || `Version ${nextVersion}`,
      notes: notes || null,
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  // Mettre à jour le statut du projet
  await supabase.from('projects').update({ status: 'analyse' }).eq('id', projectId).eq('company_id', user.company.id)

  await logAudit(user.company.id, user.id, 'create', 'dce_version', data.id, `v${nextVersion}`)
  revalidatePath(`/projets/${projectId}`)

  return { success: true, version: data }
}

/**
 * Classification IA d'un document DCE via Claude API
 * Retourne le type détecté + la confiance
 */
export async function classifyDocumentWithAI(documentId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Récupérer le document
  const { data: doc, error: docError } = await supabase
    .from('dce_documents')
    .select('*')
    .eq('id', documentId)
    .eq('company_id', user.company.id)
    .single()

  if (docError || !doc) return { error: 'Document non trouvé' }

  // Appel à Claude pour classifier
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: `Tu es un expert en marchés publics français. 
Classe le document DCE selon son type exact.
Réponds UNIQUEMENT en JSON valide : {"type": "RC"|"CCAP"|"CCTP"|"AE"|"DPGF"|"BPU"|"DQE"|"DC1"|"DC2"|"ANNEXE_ADMIN"|"ANNEXE_TECH"|"PLAN"|"CHARTE"|"AUTRE", "confidence": 0.0-1.0, "scope": "commun"|"lot", "reason": "explication courte"}`,
        messages: [{
          role: 'user',
          content: `Nom du fichier : "${doc.file_name}"
Type MIME : ${doc.mime_type || 'inconnu'}
${doc.extracted_text ? `Extrait du contenu (500 premiers caractères) :\n${doc.extracted_text.slice(0, 500)}` : ''}

Détermine le type de ce document DCE.`,
        }],
      }),
    })

    const aiData = await response.json()
    const textContent = aiData.content?.find((c: { type: string }) => c.type === 'text')?.text

    if (!textContent) throw new Error('Pas de réponse IA')

    const parsed = JSON.parse(textContent.replace(/```json\n?|```/g, '').trim())

    // Mettre à jour la classification
    await supabase
      .from('dce_documents')
      .update({
        doc_type: parsed.type as DceDocType,
        scope: parsed.scope as DocScope,
        classification_confidence: parsed.confidence,
        classification_validated: false,
      })
      .eq('id', documentId)

    revalidatePath(`/projets`)

    return {
      success: true,
      docType: parsed.type,
      scope: parsed.scope,
      confidence: parsed.confidence,
      reason: parsed.reason,
    }
  } catch (err) {
    console.error('Classification IA error:', err)

    // Fallback : classification basée sur le nom de fichier
    const fallback = classifyByFilename(doc.file_name)
    await supabase
      .from('dce_documents')
      .update({
        doc_type: fallback.type,
        classification_confidence: fallback.confidence,
      })
      .eq('id', documentId)

    return { success: true, ...fallback, fallback: true }
  }
}

/**
 * Classify tous les documents d'une version DCE en batch
 */
export async function classifyAllDocuments(projectId: string, versionId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: docs } = await supabase
    .from('dce_documents')
    .select('id')
    .eq('project_id', projectId)
    .eq('version_id', versionId)
    .eq('company_id', user.company.id)

  if (!docs?.length) return { success: true, count: 0 }

  // Classifier chaque document (en séquence pour éviter le rate limit)
  const results = []
  for (const doc of docs) {
    const result = await classifyDocumentWithAI(doc.id)
    results.push(result)
  }

  // Mettre à jour le statut du projet
  await supabase
    .from('projects')
    .update({ status: 'analyse' })
    .eq('id', projectId)

  revalidatePath(`/projets/${projectId}`)

  return { success: true, count: docs.length, results }
}

/**
 * Validation manuelle de la classification
 */
export async function validateDocumentClassification(
  documentId: string,
  docType: DceDocType,
  scope: DocScope,
  lotId?: string
) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { error } = await supabase
    .from('dce_documents')
    .update({
      doc_type: docType,
      scope,
      lot_id: lotId || null,
      classification_validated: true,
    })
    .eq('id', documentId)
    .eq('company_id', user.company.id)

  if (error) return { error: error.message }

  revalidatePath('/projets')
  return { success: true }
}

// ============================================================
// HELPER : Classification par nom de fichier (fallback sans IA)
// ============================================================
function classifyByFilename(filename: string): { type: DceDocType; confidence: number } {
  const name = filename.toLowerCase().replace(/[^a-z0-9]/g, ' ')

  const patterns: [RegExp, DceDocType, number][] = [
    [/\brc\b|r[eè]glement.{0,15}consultation/,  'RC',    0.85],
    [/\bccap\b|clauses.{0,10}admin/,             'CCAP',  0.85],
    [/\bcctp\b|clauses.{0,10}tech/,              'CCTP',  0.85],
    [/\bae\b|acte.{0,10}engagement/,             'AE',    0.85],
    [/\bdpgf\b|d[eé]composition.{0,10}prix/,     'DPGF',  0.85],
    [/\bbpu\b|bordereau.{0,10}prix/,             'BPU',   0.85],
    [/\bdqe\b|d[eé]tail.{0,10}quantitatif/,      'DQE',   0.85],
    [/\bdc1\b/,                                   'DC1',   0.90],
    [/\bdc2\b/,                                   'DC2',   0.90],
    [/\bplan\b|\.dwg$|\.dxf$/,                   'PLAN',  0.75],
    [/charte|rse|environn/,                       'CHARTE',0.70],
  ]

  for (const [pattern, type, confidence] of patterns) {
    if (pattern.test(name)) return { type, confidence }
  }

  return { type: 'AUTRE', confidence: 0.5 }
}
