/**
 * DCE Extractor Service
 * Extrait les informations clés du DCE via Claude API
 * Principe RC-first : le RC est la source prioritaire
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

// ============================================================
// TYPES DE SORTIE
// ============================================================

export interface ExtractedValue<T = string> {
  value: T | null
  source_doc: string | null    // nom du document source
  source_page: string | null   // page/section si dispo
  confidence: number           // 0.0 à 1.0
  raw_text: string | null      // texte brut extrait
  not_specified: boolean       // "Non précisé dans les documents"
}

export interface ExtractionResult {
  // Infos générales
  dlro: ExtractedValue<string>                    // date + heure ISO
  dlro_modalities: ExtractedValue<string>         // modalités de remise (dématérialisée, etc.)
  estimated_amount: ExtractedValue<number>
  market_duration: ExtractedValue<string>

  // Visite
  visit_mandatory: ExtractedValue<boolean>
  visit_date: ExtractedValue<string>
  visit_contact: ExtractedValue<string>
  visit_attestation_required: ExtractedValue<boolean>
  visit_location: ExtractedValue<string>

  // Critères de jugement
  criteria: ExtractedValue<Criterion[]>

  // Pièces à fournir
  required_docs: ExtractedValue<RequiredDocs>

  // Contraintes formelles
  formal_constraints: ExtractedValue<FormalConstraints>

  // Points de vigilance
  warning_points: ExtractedValue<WarningPoint[]>

  // Méta
  extraction_date: string
  sources_used: string[]
}

export interface Criterion {
  name: string
  weight: number                 // en %
  sub_criteria?: SubCriterion[]
  source_page?: string
}

export interface SubCriterion {
  name: string
  weight?: number
  description?: string
}

export interface RequiredDocs {
  candidature: DocItem[]
  offre_technique: DocItem[]
  offre_financiere: DocItem[]
  conditionnel: DocItem[]
}

export interface DocItem {
  name: string
  mandatory: boolean
  format?: string                // ex: "PDF", "XLSX", "DOCX"
  notes?: string
  source_page?: string
}

export interface FormalConstraints {
  page_limit?: number
  required_template: boolean
  template_name?: string
  formats_required?: string[]
  signature_required: boolean
  signature_notes?: string
  submission_platform?: string   // ex: "PLACE", "AWS"
  other?: string[]
}

export interface WarningPoint {
  type: 'eliminatoire' | 'critique' | 'attention'
  description: string
  source_page?: string
}

// ============================================================
// HELPER : appel Claude API
// ============================================================
async function callClaude(systemPrompt: string, userContent: string, maxTokens = 2000): Promise<string> {
  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.content?.find((c: { type: string }) => c.type === 'text')?.text ?? ''
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const clean = text.replace(/```json\n?|```\n?/g, '').trim()
    return JSON.parse(clean) as T
  } catch {
    return fallback
  }
}

function makeNotSpecified<T = string>(): ExtractedValue<T> {
  return { value: null, source_doc: null, source_page: null, confidence: 0, raw_text: null, not_specified: true }
}

// ============================================================
// PHASE 1 : Extraction DLRO + Visite + Infos générales
// ============================================================
export async function extractGeneralInfo(
  rcText: string,
  rcName: string,
  otherTexts: Array<{ text: string; name: string }>
): Promise<Partial<ExtractionResult>> {

  const otherContext = otherTexts
    .map(d => `\n\n--- ${d.name} ---\n${d.text.slice(0, 3000)}`)
    .join('')

  const systemPrompt = `Tu es un expert en marchés publics français. Tu extrais des informations précises de documents DCE.
RÈGLE ABSOLUE : Si une information n'est pas dans les documents, retourne not_specified: true. Ne jamais inventer.
Réponds UNIQUEMENT en JSON valide, sans markdown.`

  const userContent = `Analyse ces documents DCE et extrais les informations suivantes.

=== RÈGLEMENT DE LA CONSULTATION (SOURCE PRIORITAIRE) ===
${rcText.slice(0, 8000)}
${otherContext}

Réponds avec ce JSON exact (respecte les types) :
{
  "dlro": {
    "value": "ISO 8601 datetime ou null",
    "source_doc": "${rcName}",
    "source_page": "page X ou section Y ou null",
    "confidence": 0.0-1.0,
    "raw_text": "texte brut trouvé ou null",
    "not_specified": false
  },
  "dlro_modalities": {
    "value": "description modalités remise ou null",
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "estimated_amount": {
    "value": 0,
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "market_duration": {
    "value": "durée ou null",
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "visit_mandatory": {
    "value": true/false/null,
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "visit_date": {
    "value": "ISO 8601 ou null",
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "visit_contact": {
    "value": "nom + email/tél ou null",
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "visit_attestation_required": {
    "value": true/false/null,
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  },
  "visit_location": {
    "value": "lieu ou null",
    "source_doc": null,
    "source_page": null,
    "confidence": 0.0-1.0,
    "raw_text": null,
    "not_specified": false
  }
}`

  const raw = await callClaude(systemPrompt, userContent, 2000)
  return parseJSON<Partial<ExtractionResult>>(raw, {})
}

// ============================================================
// PHASE 2 : Extraction des critères de jugement
// ============================================================
export async function extractCriteria(
  rcText: string,
  rcName: string
): Promise<ExtractedValue<Criterion[]>> {

  const systemPrompt = `Tu es expert en marchés publics. Extrais les critères de jugement et leurs pondérations.
La somme des pondérations doit faire 100%. Réponds UNIQUEMENT en JSON valide.`

  const userContent = `Extrait les critères et pondérations de ce règlement de consultation.

=== ${rcName} ===
${rcText.slice(0, 10000)}

Réponds avec ce JSON :
{
  "value": [
    {
      "name": "Valeur technique",
      "weight": 60,
      "sub_criteria": [
        { "name": "Méthodologie", "weight": 30, "description": "..." },
        { "name": "Moyens humains", "weight": 20, "description": "..." }
      ],
      "source_page": "Article X.X ou page Y"
    }
  ],
  "source_doc": "${rcName}",
  "source_page": "article X",
  "confidence": 0.95,
  "raw_text": "extrait du texte source",
  "not_specified": false
}

Si aucun critère trouvé : {"value": null, "source_doc": null, "source_page": null, "confidence": 0, "raw_text": null, "not_specified": true}`

  const raw = await callClaude(systemPrompt, userContent, 3000)
  return parseJSON<ExtractedValue<Criterion[]>>(raw, makeNotSpecified<Criterion[]>())
}

// ============================================================
// PHASE 3 : Extraction des pièces à fournir
// ============================================================
export async function extractRequiredDocs(
  rcText: string,
  rcName: string,
  ccapText?: string
): Promise<ExtractedValue<RequiredDocs>> {

  const systemPrompt = `Tu es expert en marchés publics. Extrais la liste exhaustive des pièces à fournir.
Classe chaque pièce dans la bonne catégorie. Réponds UNIQUEMENT en JSON valide.`

  const supplement = ccapText ? `\n\n=== CCAP (complément) ===\n${ccapText.slice(0, 3000)}` : ''

  const userContent = `Extrais toutes les pièces à fournir pour la candidature et l'offre.

=== ${rcName} (SOURCE PRIORITAIRE) ===
${rcText.slice(0, 10000)}
${supplement}

Réponds avec ce JSON :
{
  "value": {
    "candidature": [
      { "name": "DC1 - Lettre de candidature", "mandatory": true, "format": "PDF", "notes": "À signer", "source_page": "Article X" },
      { "name": "DC2 - Déclaration du candidat", "mandatory": true, "format": "PDF" },
      { "name": "Attestations assurances RC Pro", "mandatory": true, "format": "PDF" }
    ],
    "offre_technique": [
      { "name": "Mémoire technique", "mandatory": true, "format": "PDF", "notes": "15 pages max", "source_page": "Article X" }
    ],
    "offre_financiere": [
      { "name": "Acte d'engagement", "mandatory": true, "format": "PDF" },
      { "name": "DPGF renseignée", "mandatory": true, "format": "XLSX" }
    ],
    "conditionnel": [
      { "name": "Attestation de visite", "mandatory": true, "notes": "Si visite obligatoire" }
    ]
  },
  "source_doc": "${rcName}",
  "source_page": "Article X.X",
  "confidence": 0.90,
  "raw_text": null,
  "not_specified": false
}`

  const raw = await callClaude(systemPrompt, userContent, 3000)
  return parseJSON<ExtractedValue<RequiredDocs>>(raw, makeNotSpecified<RequiredDocs>())
}

// ============================================================
// PHASE 4 : Contraintes formelles + Points de vigilance
// ============================================================
export async function extractConstraintsAndWarnings(
  rcText: string,
  rcName: string,
  ccapText?: string
): Promise<{
  formal_constraints: ExtractedValue<FormalConstraints>
  warning_points: ExtractedValue<WarningPoint[]>
}> {

  const systemPrompt = `Tu es expert en marchés publics. Extrais les contraintes formelles et les points de vigilance critiques.
Sois exhaustif sur les éliminatoires — une offre non conforme est rejetée sans examen.
Réponds UNIQUEMENT en JSON valide.`

  const supplement = ccapText ? `\n\n=== CCAP ===\n${ccapText.slice(0, 3000)}` : ''

  const userContent = `Extrais les contraintes formelles et points de vigilance.

=== ${rcName} ===
${rcText.slice(0, 10000)}
${supplement}

Réponds avec ce JSON exact :
{
  "formal_constraints": {
    "value": {
      "page_limit": 15,
      "required_template": true,
      "template_name": "Trame DPGF fournie par l'acheteur",
      "formats_required": ["PDF", "XLSX"],
      "signature_required": true,
      "signature_notes": "Signature électronique requise",
      "submission_platform": "PLACE",
      "other": ["Police minimum 11pt", "Format A4 portrait"]
    },
    "source_doc": "${rcName}",
    "source_page": null,
    "confidence": 0.85,
    "raw_text": null,
    "not_specified": false
  },
  "warning_points": {
    "value": [
      {
        "type": "eliminatoire",
        "description": "Offre financière incomplète (DPGF non renseignée) → rejet sans examen",
        "source_page": "Article X.X"
      },
      {
        "type": "critique",
        "description": "Visite obligatoire : attestation à joindre impérativement",
        "source_page": "Article Y"
      },
      {
        "type": "attention",
        "description": "Mémoire technique limité à 15 pages hors annexes",
        "source_page": "Article Z"
      }
    ],
    "source_doc": "${rcName}",
    "source_page": null,
    "confidence": 0.90,
    "raw_text": null,
    "not_specified": false
  }
}`

  const raw = await callClaude(systemPrompt, userContent, 2500)
  const parsed = parseJSON<any>(raw, {})

  return {
    formal_constraints: parsed.formal_constraints ?? makeNotSpecified<FormalConstraints>(),
    warning_points: parsed.warning_points ?? makeNotSpecified<WarningPoint[]>(),
  }
}

// ============================================================
// EXTRACTION COMPLÈTE (orchestrateur)
// ============================================================
export async function extractFullDCE(
  documents: Array<{ id: string; file_name: string; doc_type: string; extracted_text: string | null }>
): Promise<ExtractionResult> {

  // Sélectionner les documents par type
  const rc = documents.find(d => d.doc_type === 'RC')
  const ccap = documents.find(d => d.doc_type === 'CCAP')
  const cctp = documents.find(d => d.doc_type === 'CCTP')

  const rcText = rc?.extracted_text ?? ''
  const rcName = rc?.file_name ?? 'RC non trouvé'
  const ccapText = ccap?.extracted_text ?? undefined
  const sourcesUsed = [rc, ccap, cctp].filter(Boolean).map(d => d!.file_name)

  // Autres documents pour contexte
  const otherDocs = documents
    .filter(d => !['RC', 'CCAP', 'CCTP'].includes(d.doc_type) && d.extracted_text)
    .slice(0, 2)
    .map(d => ({ text: d.extracted_text!, name: d.file_name }))

  if (!rcText) {
    // Pas de RC : on utilise tous les docs disponibles
    const firstDoc = documents.find(d => d.extracted_text)
    return {
      ...buildEmptyResult(),
      warning_points: {
        value: [{
          type: 'critique',
          description: 'Aucun RC identifié dans les documents importés. L\'analyse est basée sur les autres pièces disponibles.',
          source_page: null
        }],
        source_doc: null,
        source_page: null,
        confidence: 1,
        raw_text: null,
        not_specified: false
      },
      extraction_date: new Date().toISOString(),
      sources_used: sourcesUsed,
    }
  }

  // Appels parallèles pour les 4 phases
  const [generalInfo, criteria, requiredDocs, constraintsAndWarnings] = await Promise.all([
    extractGeneralInfo(rcText, rcName, otherDocs),
    extractCriteria(rcText, rcName),
    extractRequiredDocs(rcText, rcName, ccapText),
    extractConstraintsAndWarnings(rcText, rcName, ccapText),
  ])

  return {
    // Infos générales
    dlro: generalInfo.dlro ?? makeNotSpecified(),
    dlro_modalities: generalInfo.dlro_modalities ?? makeNotSpecified(),
    estimated_amount: generalInfo.estimated_amount ?? makeNotSpecified<number>(),
    market_duration: generalInfo.market_duration ?? makeNotSpecified(),

    // Visite
    visit_mandatory: generalInfo.visit_mandatory ?? makeNotSpecified<boolean>(),
    visit_date: generalInfo.visit_date ?? makeNotSpecified(),
    visit_contact: generalInfo.visit_contact ?? makeNotSpecified(),
    visit_attestation_required: generalInfo.visit_attestation_required ?? makeNotSpecified<boolean>(),
    visit_location: generalInfo.visit_location ?? makeNotSpecified(),

    // Critères
    criteria,

    // Pièces
    required_docs: requiredDocs,

    // Contraintes + vigilance
    formal_constraints: constraintsAndWarnings.formal_constraints,
    warning_points: constraintsAndWarnings.warning_points,

    // Méta
    extraction_date: new Date().toISOString(),
    sources_used: sourcesUsed,
  }
}

function buildEmptyResult(): ExtractionResult {
  const ns = makeNotSpecified
  return {
    dlro: ns(), dlro_modalities: ns(), estimated_amount: ns<number>(),
    market_duration: ns(), visit_mandatory: ns<boolean>(), visit_date: ns(),
    visit_contact: ns(), visit_attestation_required: ns<boolean>(), visit_location: ns(),
    criteria: ns<Criterion[]>(), required_docs: ns<RequiredDocs>(),
    formal_constraints: ns<FormalConstraints>(), warning_points: ns<WarningPoint[]>(),
    extraction_date: new Date().toISOString(), sources_used: [],
  }
}
