/**
 * RAG Service — Retrieval Augmented Generation pour le chatbot
 *
 * Stratégie : contexte window RAG (pas de vector DB pour l'instant)
 * On construit un contexte riche mais ciblé depuis :
 *   1. Extraction DCE (fiche synthèse)
 *   2. Textes des documents DCE (RC, CCAP, CCTP)
 *   3. Données entreprise (capacités, références)
 *   4. Livrables générés (mémoire, état checklist, prix)
 *
 * Règle absolue : réponse "Non précisé dans les documents." si absent
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

export interface ChatSource {
  doc: string
  page?: string
  excerpt?: string
}

export interface ChatResponse {
  content: string
  sources: ChatSource[]
  tokens_used: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// ============================================================
// CONSTRUIRE LE CONTEXTE RAG
// ============================================================
export interface RagContext {
  project_title: string
  buyer_name: string | null
  lot_title: string
  lot_number: number
  // DCE extrait
  extraction: any
  // Textes bruts des documents DCE clés
  rc_text?: string
  ccap_text?: string
  cctp_text?: string
  // Données entreprise
  company_name: string
  certifications: string[]
  staff_summary: string[]
  equipment_summary: string[]
  references_summary: string[]
  // État checklist
  checklist_summary: string
  missing_items: string[]
  // État mémoire
  memoire_status?: string
  memoire_sections?: Array<{ heading: string; status: string; word_count: number }>
  // État prix
  prix_total?: number | null
  prix_status?: string
}

export function buildSystemPrompt(ctx: RagContext): string {
  // Résumer l'extraction DCE
  const dlro = ctx.extraction?.dlro
  const criteria = ctx.extraction?.criteria?.value ?? []
  const warningPoints = ctx.extraction?.warning_points?.value ?? []
  const requiredDocs = ctx.extraction?.required_docs?.value
  const visitInfo = ctx.extraction?.visit_info
  const formalConstraints = ctx.extraction?.formal_constraints?.value

  const criteriaText = criteria.length > 0
    ? criteria.map((c: any) => `  - ${c.name} (${c.weight}%)${c.sub_criteria?.length ? ': ' + c.sub_criteria.map((s: any) => s.name).join(', ') : ''}`).join('\n')
    : '  Non précisé dans les documents.'

  const piecesText = requiredDocs ? [
    requiredDocs.candidature?.map((d: any) => `  [Candidature] ${d.name}${d.mandatory ? ' ★' : ''}`).join('\n'),
    requiredDocs.offre_technique?.map((d: any) => `  [Offre tech] ${d.name}${d.mandatory ? ' ★' : ''}`).join('\n'),
    requiredDocs.offre_financiere?.map((d: any) => `  [Financier] ${d.name}${d.mandatory ? ' ★' : ''}`).join('\n'),
    requiredDocs.conditionnel?.map((d: any) => `  [Conditionnel] ${d.name}`).join('\n'),
  ].filter(Boolean).join('\n') : '  Non précisé dans les documents.'

  const warningsText = warningPoints.length > 0
    ? warningPoints.map((w: any) => `  [${w.type.toUpperCase()}] ${w.description}`).join('\n')
    : '  Aucun point de vigilance détecté.'

  const checklistText = ctx.missing_items.length > 0
    ? `Pièces manquantes (${ctx.missing_items.length}) :\n${ctx.missing_items.map(i => `  - ${i}`).join('\n')}`
    : 'Toutes les pièces obligatoires sont fournies.'

  return `Tu es l'assistant IA de la plateforme AO, spécialisé dans les marchés publics français.
Tu aides l'entreprise "${ctx.company_name}" à répondre à l'appel d'offres suivant.

RÈGLE ABSOLUE — ZÉRO INVENTION :
- Tu réponds UNIQUEMENT à partir des informations ci-dessous.
- Si une information n'est pas présente : réponds exactement "Non précisé dans les documents."
- Ne jamais inventer de chiffres, dates, noms, exigences ou procédures.
- Pour chaque affirmation, indique la source entre crochets : [RC], [CCAP], [CCTP], [Entreprise], etc.

FORMAT :
- Réponses concises et opérationnelles.
- Si tu cites une source précise, indique : [SOURCE: nom_document, page/section].
- Pour les listes, utilise des tirets.
- Maximum 400 mots sauf si l'utilisateur demande plus de détails.

════════════════════════════════════════
CORPUS DU PROJET — ${ctx.project_title}
Lot ${ctx.lot_number} : ${ctx.lot_title}
Acheteur : ${ctx.buyer_name ?? 'Non précisé dans les documents.'}
════════════════════════════════════════

── INFOS CLÉS (issues du RC) ──
DLRO : ${dlro?.value ? `${new Date(dlro.value).toLocaleDateString('fr-FR')} à ${new Date(dlro.value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} [SOURCE: ${dlro.source_doc ?? 'RC'}, ${dlro.source_page ?? ''}]` : 'Non précisé dans les documents.'}
Visite obligatoire : ${visitInfo?.mandatory?.value === true ? `Oui${visitInfo.date?.value ? ` — le ${new Date(visitInfo.date.value).toLocaleDateString('fr-FR')}` : ''}${visitInfo.contact?.value ? ` — Contact : ${visitInfo.contact.value}` : ''}` : visitInfo?.mandatory?.value === false ? 'Non' : 'Non précisé dans les documents.'}
Attestation visite : ${visitInfo?.attestation_required?.value ? 'Requise' : 'Non précisée'}
Montant estimé : ${ctx.extraction?.estimated_amount?.value ? `${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(ctx.extraction.estimated_amount.value)} [SOURCE: ${ctx.extraction.estimated_amount.source_doc ?? 'RC'}]` : 'Non précisé dans les documents.'}
Durée : ${ctx.extraction?.market_duration?.value ?? 'Non précisée dans les documents.'}
Plateforme de dépôt : ${formalConstraints?.submission_platform ?? 'Non précisée dans les documents.'}
Limite de pages : ${formalConstraints?.page_limit ? `${formalConstraints.page_limit} pages` : 'Non précisée'}

── CRITÈRES DE JUGEMENT ──
${criteriaText}

── PIÈCES À FOURNIR (★ = obligatoire) ──
${piecesText}

── POINTS DE VIGILANCE ──
${warningsText}

── CONFORMITÉ DU DOSSIER ──
${checklistText}

── ÉTAT DES LIVRABLES ──
Mémoire : ${ctx.memoire_status ?? 'Non démarré'}${ctx.memoire_sections?.length ? ` — ${ctx.memoire_sections.filter(s => s.status === 'valide').length}/${ctx.memoire_sections.length} sections validées` : ''}
Prix : ${ctx.prix_status ?? 'Non importé'}${ctx.prix_total ? ` — Total HT : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(ctx.prix_total)}` : ''}

── CAPACITÉS ENTREPRISE ──
Certifications : ${ctx.certifications.length > 0 ? ctx.certifications.join(', ') : 'Aucune enregistrée'}
Moyens humains : ${ctx.staff_summary.slice(0, 5).join(' | ') || 'Non renseigné'}
Matériels : ${ctx.equipment_summary.slice(0, 5).join(' | ') || 'Non renseigné'}
Références : ${ctx.references_summary.slice(0, 5).join(' | ') || 'Aucune enregistrée'}

${ctx.rc_text ? `── EXTRAIT RC (source prioritaire) ──\n${ctx.rc_text.slice(0, 4000)}` : ''}
${ctx.cctp_text ? `\n── EXTRAIT CCTP ──\n${ctx.cctp_text.slice(0, 2000)}` : ''}
════════════════════════════════════════`
}

// ============================================================
// APPEL CLAUDE AVEC HISTORIQUE
// ============================================================
export async function chatWithContext(
  systemPrompt: string,
  history: ConversationMessage[],
  userMessage: string
): Promise<ChatResponse> {
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ]

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API ${response.status}: ${err}`)
  }

  const data = await response.json()
  const content = data.content?.find((c: any) => c.type === 'text')?.text ?? ''
  const tokens = data.usage?.output_tokens ?? 0

  // Extraire les sources mentionnées dans la réponse
  const sources = extractSources(content)

  return { content, sources, tokens_used: tokens }
}

// ============================================================
// EXTRACTION DES SOURCES CITÉES
// ============================================================
function extractSources(text: string): ChatSource[] {
  const sources: ChatSource[] = []
  // Pattern [SOURCE: document, page]
  const sourceRegex = /\[SOURCE:\s*([^,\]]+)(?:,\s*([^\]]+))?\]/g
  let match

  while ((match = sourceRegex.exec(text)) !== null) {
    const doc = match[1]?.trim()
    const page = match[2]?.trim()
    if (doc && !sources.some(s => s.doc === doc && s.page === page)) {
      sources.push({ doc, page })
    }
  }

  return sources
}

// ============================================================
// QUESTIONS PRÉDÉFINIES (suggestions rapides)
// ============================================================
export const QUICK_QUESTIONS = [
  { icon: '⏰', label: 'Quelle est la DLRO ?',          query: 'Quelle est la date limite de remise des offres (DLRO) exacte, avec l\'heure ?' },
  { icon: '⚖️', label: 'Quels sont les critères ?',      query: 'Quels sont les critères de jugement des offres et leurs pondérations exactes ?' },
  { icon: '📂', label: 'Que manque-t-il ?',              query: 'Quelles sont les pièces obligatoires encore manquantes dans le dossier ?' },
  { icon: '🏗️', label: 'Visite obligatoire ?',           query: 'La visite de site est-elle obligatoire ? Si oui, quelles sont les modalités et le contact ?' },
  { icon: '📝', label: 'Exigences du mémoire ?',         query: 'Quelles sont les exigences formelles pour le mémoire technique (pages, trame, format) ?' },
  { icon: '🚫', label: 'Points éliminatoires ?',         query: 'Quels sont les points éliminatoires et causes de rejet de l\'offre ?' },
  { icon: '💶', label: 'Infos financières ?',            query: 'Quel est le montant estimé du marché et les pièces financières demandées ?' },
  { icon: '📋', label: 'Résume les critères',            query: 'Résume les critères et leurs pondérations sous forme de tableau, avec les sous-critères si disponibles.' },
] as const
