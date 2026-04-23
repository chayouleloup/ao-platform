'use server'

import { createClient, getAuthUser } from '@/lib/supabase/server'
import { buildSystemPrompt, chatWithContext, type ConversationMessage, type RagContext } from '@/lib/services/rag-service'

async function requireAuth() {
  const user = await getAuthUser()
  if (!user) throw new Error('Non authentifié')
  return user
}

// ============================================================
// CONSTRUIRE LE CONTEXTE RAG COMPLET D'UN LOT
// ============================================================
async function buildRagContext(projectId: string, lotId: string, companyId: string): Promise<RagContext> {
  const supabase = await createClient()

  const [
    { data: project },
    { data: lot },
    { data: extraction },
    { data: company },
    { data: certifications },
    { data: staff },
    { data: equipment },
    { data: references },
    { data: checklistItems },
    { data: memoire },
    { data: prixFichier },
    { data: rcDoc },
    { data: cctpDoc },
  ] = await Promise.all([
    supabase.from('projects').select('title, buyer_name').eq('id', projectId).single(),
    supabase.from('lots').select('title, number').eq('id', lotId).single(),
    supabase.from('project_extractions').select('*').eq('lot_id', lotId).eq('extraction_status', 'done').order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('companies').select('name, ao_contact_name, ao_contact_email, primary_color').eq('id', companyId).single(),
    supabase.from('company_certifications').select('name, expires_at').eq('company_id', companyId).eq('is_active', true),
    supabase.from('company_staff').select('full_name, job_title, qualifications').eq('company_id', companyId).eq('is_active', true),
    supabase.from('company_equipment').select('name, category, capacity').eq('company_id', companyId).eq('is_available', true),
    supabase.from('company_references').select('client_name, project_name, location, amount, tags').eq('company_id', companyId).order('is_featured', { ascending: false }).limit(10),
    supabase.from('checklist_items').select('name, status, character, category').eq('lot_id', lotId).eq('company_id', companyId),
    supabase.from('memoires').select('status, memoire_sections(heading, status, word_count)').eq('lot_id', lotId).eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('prix_fichiers').select('status, total_ht').eq('lot_id', lotId).eq('company_id', companyId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('dce_documents').select('extracted_text').eq('project_id', projectId).eq('doc_type', 'RC').limit(1).single(),
    supabase.from('dce_documents').select('extracted_text').eq('project_id', projectId).eq('doc_type', 'CCTP').limit(1).single(),
  ])

  // Pièces manquantes
  const missingItems = (checklistItems ?? [])
    .filter(i => i.character === 'obligatoire' && i.status === 'manquant')
    .map(i => i.name)

  // Résumés
  const certSummary = (certifications ?? []).map(c => c.name)
  const staffSummary = (staff ?? []).map(s => `${s.full_name}${s.job_title ? ` (${s.job_title})` : ''}`)
  const equipSummary = (equipment ?? []).map(e => `${e.name}${e.capacity ? ` — ${e.capacity}` : ''}`)
  const refSummary = (references ?? []).map(r => `${r.client_name}${r.project_name ? ` — ${r.project_name}` : ''}${r.location ? `, ${r.location}` : ''}`)

  const checklistSummary = checklistItems
    ? `${checklistItems.filter(i => i.status === 'fourni').length}/${checklistItems.length} pièces fournies`
    : 'Checklist non générée'

  return {
    project_title: project?.title ?? 'Marché',
    buyer_name: project?.buyer_name ?? null,
    lot_title: lot?.title ?? 'Lot',
    lot_number: lot?.number ?? 1,
    extraction,
    rc_text: rcDoc?.extracted_text ?? undefined,
    cctp_text: cctpDoc?.extracted_text ?? undefined,
    company_name: company?.name ?? '',
    certifications: certSummary,
    staff_summary: staffSummary,
    equipment_summary: equipSummary,
    references_summary: refSummary,
    checklist_summary: checklistSummary,
    missing_items: missingItems,
    memoire_status: (memoire as any)?.status,
    memoire_sections: (memoire as any)?.memoire_sections ?? [],
    prix_total: (prixFichier as any)?.total_ht,
    prix_status: (prixFichier as any)?.status,
  }
}

// ============================================================
// CRÉER UNE NOUVELLE CONVERSATION
// ============================================================
export async function createConversation(projectId: string, lotId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      project_id: projectId,
      lot_id: lotId,
      company_id: user.company.id,
      user_id: user.id,
      title: 'Nouvelle conversation',
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { success: true, conversation: data }
}

// ============================================================
// ENVOYER UN MESSAGE
// ============================================================
export async function sendChatMessage(params: {
  conversationId: string
  projectId: string
  lotId: string
  userMessage: string
  history: ConversationMessage[]
}) {
  const user = await requireAuth()
  const supabase = await createClient()

  // Vérifier que la conversation appartient à l'entreprise
  const { data: conv } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('id', params.conversationId)
    .eq('company_id', user.company.id)
    .single()

  if (!conv) return { error: 'Conversation non trouvée' }

  // Sauvegarder le message utilisateur
  await supabase.from('chat_messages').insert({
    conversation_id: params.conversationId,
    company_id: user.company.id,
    role: 'user',
    content: params.userMessage,
  })

  // Construire le contexte RAG
  const ragContext = await buildRagContext(params.projectId, params.lotId, user.company.id)
  const systemPrompt = buildSystemPrompt(ragContext)

  // Appel Claude
  let response
  try {
    response = await chatWithContext(systemPrompt, params.history, params.userMessage)
  } catch (err: any) {
    return { error: `Erreur IA : ${err.message}` }
  }

  // Sauvegarder la réponse
  const { data: savedMsg } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: params.conversationId,
      company_id: user.company.id,
      role: 'assistant',
      content: response.content,
      sources: response.sources,
      tokens_used: response.tokens_used,
    })
    .select()
    .single()

  // Mettre à jour le titre de la conversation si c'est le premier message
  if (params.history.length === 0) {
    const title = params.userMessage.slice(0, 60) + (params.userMessage.length > 60 ? '...' : '')
    await supabase
      .from('chat_conversations')
      .update({ title })
      .eq('id', params.conversationId)
  }

  return {
    success: true,
    message: {
      id: savedMsg?.id,
      role: 'assistant' as const,
      content: response.content,
      sources: response.sources,
    },
  }
}

// ============================================================
// RÉCUPÉRER L'HISTORIQUE D'UNE CONVERSATION
// ============================================================
export async function getConversationHistory(conversationId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, sources, created_at')
    .eq('conversation_id', conversationId)
    .eq('company_id', user.company.id)
    .order('created_at')

  return data ?? []
}

// ============================================================
// LISTER LES CONVERSATIONS D'UN PROJET
// ============================================================
export async function getProjectConversations(projectId: string) {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data } = await supabase
    .from('chat_conversations')
    .select('id, title, lot_id, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('company_id', user.company.id)
    .order('updated_at', { ascending: false })

  return data ?? []
}
