/**
 * Memoire AI Service
 * Génère le plan aligné sur les critères DCE
 * puis rédige chaque section avec les données entreprise
 * Règle absolue : ZÉRO INVENTION — "Non précisé dans les documents." si absence de source
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

async function callClaude(system: string, user: string, maxTokens = 3000): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await res.json()
  return data.content?.find((c: any) => c.type === 'text')?.text ?? ''
}

// ============================================================
// TYPES
// ============================================================
export interface SectionPlan {
  order: number
  level: number
  heading: string
  section_type: 'cover' | 'toc' | 'criterion' | 'appendix' | 'custom'
  criterion_name?: string
  criterion_weight?: number
}

export interface GeneratedSection {
  content: string
  status: 'genere' | 'a_completer'
  word_count: number
  has_missing: boolean
}

// ============================================================
// ÉTAPE 1 : GÉNÉRER LE PLAN DU MÉMOIRE
// Aligné strictement sur les critères du RC
// ============================================================
export async function generateMemorePlan(params: {
  projectTitle: string
  buyerName: string | null
  lotTitle: string
  criteria: Array<{ name: string; weight: number; sub_criteria?: Array<{ name: string; weight?: number }> }>
  formalConstraints: any
  pageLimit: number | null
}): Promise<SectionPlan[]> {

  const criteriaText = params.criteria.map(c => {
    const sub = c.sub_criteria?.map(s => `    - ${s.name}${s.weight ? ` (${s.weight}%)` : ''}`).join('\n') ?? ''
    return `- ${c.name} (${c.weight}%)${sub ? '\n' + sub : ''}`
  }).join('\n')

  const system = `Tu es expert en rédaction de mémoires techniques pour marchés publics français.
Tu génères un plan DOCX structuré, strictement aligné sur les critères du RC.
Réponds UNIQUEMENT en JSON valide — tableau de sections.`

  const prompt = `Génère le plan détaillé du mémoire technique pour :

Marché : ${params.projectTitle}
Acheteur : ${params.buyerName ?? 'Non précisé'}
Lot : ${params.lotTitle}
${params.pageLimit ? `Limite : ${params.pageLimit} pages (hors page de garde et sommaire)` : ''}

Critères et pondérations :
${criteriaText}

Retourne un JSON : tableau d'objets avec ces champs exactement :
[
  {
    "order": 1,
    "level": 1,
    "heading": "Page de garde",
    "section_type": "cover",
    "criterion_name": null,
    "criterion_weight": null
  },
  {
    "order": 2,
    "level": 1,
    "heading": "Sommaire",
    "section_type": "toc",
    "criterion_name": null,
    "criterion_weight": null
  },
  {
    "order": 3,
    "level": 1,
    "heading": "1. Compréhension du besoin et enjeux du marché",
    "section_type": "criterion",
    "criterion_name": "Valeur technique",
    "criterion_weight": 60
  }
]

Règles :
- Commence toujours par "Page de garde" (cover) et "Sommaire" (toc)
- Une section de niveau 1 par critère principal
- Des sous-sections de niveau 2 pour chaque sous-critère
- Ajoute une section "Références pertinentes" (criterion) en avant-dernier
- Termine par "Conclusion" (custom)
- Les headings sont numérotés : "1. Titre", "1.1 Sous-titre"
- section_type = "criterion" pour tout ce qui est noté`

  const raw = await callClaude(system, prompt, 2000)
  try {
    const clean = raw.replace(/```json\n?|```\n?/g, '').trim()
    return JSON.parse(clean) as SectionPlan[]
  } catch {
    // Plan de fallback minimal
    return buildFallbackPlan(params.criteria)
  }
}

// ============================================================
// ÉTAPE 2 : RÉDIGER UNE SECTION
// Utilise données entreprise + extraction DCE
// Règle ZÉRO INVENTION absolue
// ============================================================
export async function generateSection(params: {
  section: SectionPlan
  projectTitle: string
  buyerName: string | null
  lotTitle: string
  lotNumber: number
  // Données entreprise
  companyName: string
  companyData: {
    address?: string | null
    siret?: string | null
    ao_contact_name?: string | null
    ao_contact_email?: string | null
    ao_contact_phone?: string | null
    revenue_n1?: number | null
  }
  certifications: Array<{ name: string; number?: string | null; expires_at?: string | null }>
  staff: Array<{ full_name: string; job_title?: string | null; experience_years?: number | null; qualifications: string[] }>
  equipment: Array<{ name: string; category?: string | null; capacity?: string | null; quantity: number }>
  references: Array<{ client_name: string; project_name?: string | null; location?: string | null; amount?: number | null; description?: string | null; tags: string[] }>
  // Données DCE
  cctp_extract?: string
  criteria: Array<{ name: string; weight: number; sub_criteria?: any[] }>
  warningPoints?: Array<{ type: string; description: string }>
  // Réponses aux questions IA (à venir)
  aiAnswers?: Record<string, string>
  // Contraintes
  pageLimit?: number | null
}): Promise<GeneratedSection> {

  // Section de garde → génération structurée sans IA
  if (params.section.section_type === 'cover') {
    return generateCoverSection(params)
  }
  if (params.section.section_type === 'toc') {
    return { content: '[SOMMAIRE AUTOMATIQUE]', status: 'genere', word_count: 0, has_missing: false }
  }

  // Construire le contexte entreprise
  const certifText = params.certifications.length > 0
    ? params.certifications.map(c => `- ${c.name}${c.number ? ` n°${c.number}` : ''}${c.expires_at ? ` (valide jusqu'au ${new Date(c.expires_at).toLocaleDateString('fr-FR')})` : ''}`).join('\n')
    : null

  const staffText = params.staff.length > 0
    ? params.staff.map(s => `- ${s.full_name}${s.job_title ? `, ${s.job_title}` : ''}${s.experience_years ? `, ${s.experience_years} ans d'exp.` : ''}${s.qualifications.length ? ` | ${s.qualifications.join(', ')}` : ''}`).join('\n')
    : null

  const equipText = params.equipment.length > 0
    ? params.equipment.map(e => `- ${e.name}${e.category ? ` (${e.category})` : ''}${e.capacity ? ` — ${e.capacity}` : ''}${e.quantity > 1 ? ` × ${e.quantity}` : ''}`).join('\n')
    : null

  const refText = params.references.slice(0, 8).length > 0
    ? params.references.slice(0, 8).map(r =>
        `- ${r.client_name}${r.project_name ? ` — ${r.project_name}` : ''}${r.location ? `, ${r.location}` : ''}${r.amount ? ` (${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(r.amount)})` : ''}${r.description ? ` : ${r.description.slice(0, 120)}` : ''}`
      ).join('\n')
    : null

  const system = `Tu es expert en rédaction de mémoires techniques pour marchés publics français.

RÈGLE ABSOLUE — ZÉRO INVENTION :
- Utilise UNIQUEMENT les informations fournies dans le contexte.
- Si une information n'est pas disponible, écris exactement : "Non précisé dans les documents."
- Ne jamais inventer de chiffres, dates, noms, références ou descriptions.
- Ne jamais utiliser de formules génériques vides ("Notre entreprise s'engage à...") sans preuve.
- Chaque affirmation doit s'appuyer sur les données fournies.

FORMAT :
- Rédige en prose professionnelle, paragraphes complets.
- Utilise des listes à puces quand c'est plus lisible (équipes, matériels, références).
- Pas de markdown headers (##) dans le contenu — le titre est géré séparément.
- Longueur cible : 150-350 mots par section selon la pondération du critère.`

  const userContent = `Rédige la section suivante du mémoire technique :

SECTION : "${params.section.heading}"
${params.section.criterion_weight ? `PONDÉRATION : ${params.section.criterion_weight}%` : ''}
${params.section.criterion_name ? `CRITÈRE : ${params.section.criterion_name}` : ''}

=== MARCHÉ ===
Intitulé : ${params.projectTitle}
Acheteur : ${params.buyerName ?? 'Non précisé dans les documents.'}
Lot : ${params.lotTitle}

=== ENTREPRISE ===
Raison sociale : ${params.companyName}
SIRET : ${params.companyData.siret ?? 'Non précisé dans les documents.'}
Adresse : ${params.companyData.address ?? 'Non précisé dans les documents.'}
Interlocuteur AO : ${params.companyData.ao_contact_name ?? 'Non précisé dans les documents.'}
${params.companyData.ao_contact_email ? `Email : ${params.companyData.ao_contact_email}` : ''}
${params.companyData.ao_contact_phone ? `Tél : ${params.companyData.ao_contact_phone}` : ''}
${params.companyData.revenue_n1 ? `CA N-1 : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(params.companyData.revenue_n1)}` : ''}

${certifText ? `=== CERTIFICATIONS ===\n${certifText}` : '=== CERTIFICATIONS ===\nAucune certification enregistrée.'}

${staffText ? `=== MOYENS HUMAINS ===\n${staffText}` : '=== MOYENS HUMAINS ===\nAucun profil RH enregistré.'}

${equipText ? `=== MOYENS TECHNIQUES ===\n${equipText}` : '=== MOYENS TECHNIQUES ===\nAucun matériel enregistré.'}

${refText ? `=== RÉFÉRENCES PERTINENTES ===\n${refText}` : '=== RÉFÉRENCES ===\nAucune référence enregistrée.'}

${params.cctp_extract ? `=== EXTRAIT CCTP (exigences techniques) ===\n${params.cctp_extract.slice(0, 2000)}` : ''}

${params.aiAnswers && Object.keys(params.aiAnswers).length > 0
  ? `=== RÉPONSES AUX QUESTIONS IA ===\n${Object.entries(params.aiAnswers).map(([q, a]) => `Q: ${q}\nR: ${a}`).join('\n\n')}`
  : ''}

Rédige maintenant la section "${params.section.heading}" en respectant strictement la règle ZÉRO INVENTION.`

  const content = await callClaude(system, userContent, 1500)

  const hasMissing = content.includes('Non précisé dans les documents')
  const wordCount = content.split(/\s+/).filter(Boolean).length

  return {
    content,
    status: hasMissing ? 'a_completer' : 'genere',
    word_count: wordCount,
    has_missing: hasMissing,
  }
}

// ============================================================
// Page de garde (génération structurée, pas IA)
// ============================================================
function generateCoverSection(params: any): GeneratedSection {
  const content = `# ${params.projectTitle}

**Lot ${params.lotNumber} — ${params.lotTitle}**

---

**Pouvoir adjudicateur :** ${params.buyerName ?? 'Non précisé dans les documents.'}

**Soumissionnaire :** ${params.companyName}
${params.companyData.siret ? `SIRET : ${params.companyData.siret}` : ''}
${params.companyData.address ? `Adresse : ${params.companyData.address}` : ''}

---

**Interlocuteur dédié :** ${params.companyData.ao_contact_name ?? 'Non précisé dans les documents.'}
${params.companyData.ao_contact_email ? `📧 ${params.companyData.ao_contact_email}` : ''}
${params.companyData.ao_contact_phone ? `📞 ${params.companyData.ao_contact_phone}` : ''}

---

*Document confidentiel — Mémoire technique*
*Généré le ${new Date().toLocaleDateString('fr-FR')}*`

  return { content, status: 'genere', word_count: 80, has_missing: !params.companyData.ao_contact_name }
}

// ============================================================
// Plan de fallback si la génération IA échoue
// ============================================================
function buildFallbackPlan(criteria: Array<{ name: string; weight: number }>): SectionPlan[] {
  const sections: SectionPlan[] = [
    { order: 1, level: 1, heading: 'Page de garde', section_type: 'cover' },
    { order: 2, level: 1, heading: 'Sommaire', section_type: 'toc' },
    { order: 3, level: 1, heading: '1. Compréhension du besoin', section_type: 'criterion', criterion_name: criteria[0]?.name, criterion_weight: criteria[0]?.weight },
    { order: 4, level: 1, heading: '2. Organisation et méthodologie', section_type: 'criterion', criterion_name: criteria[1]?.name, criterion_weight: criteria[1]?.weight },
    { order: 5, level: 1, heading: '3. Moyens humains', section_type: 'criterion' },
    { order: 6, level: 1, heading: '4. Moyens matériels et techniques', section_type: 'criterion' },
    { order: 7, level: 1, heading: '5. Qualité et démarche RSE', section_type: 'criterion' },
    { order: 8, level: 1, heading: '6. Références pertinentes', section_type: 'criterion' },
    { order: 9, level: 1, heading: 'Conclusion', section_type: 'custom' },
  ]
  return sections
}
