/**
 * DPGF Parser + IA Mapper
 * Parse le fichier Excel DPGF/BPU/DQE importé
 * Identifie désignations, unités, quantités, PU, montants
 * Mappe chaque ligne avec la bibliothèque de prix via Claude
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

// ============================================================
// TYPES
// ============================================================
export interface ParsedLine {
  row_index: number
  display_order: number
  sheet_name: string
  designation: string | null
  unite: string | null
  quantite: number | null
  pu: number | null
  montant: number | null
  is_section_header: boolean
  is_subtotal: boolean
}

export interface ParsedSheet {
  name: string
  lines: ParsedLine[]
}

export interface MappingResult {
  ligne_id_temp: number
  matched_article: string | null
  pu_propose: number | null
  unite_propose: string | null
  confidence: number
  source: 'prix_client' | 'ia_estimate' | 'non_trouve'
  justification: string
}

export interface AnomalieDetected {
  ligne_index: number
  type: string
  severity: 'bloquante' | 'attention'
  description: string
  suggestion: string | null
}

// ============================================================
// PARSING CÔTÉ CLIENT (via SheetJS)
// Ce code sera exécuté dans le navigateur
// ============================================================
export function parseExcelClientSide(workbook: any): ParsedSheet[] {
  // workbook = objet SheetJS (XLSX.read(buffer))
  const sheets: ParsedSheet[] = []

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    const lines: ParsedLine[] = []
    let displayOrder = 0

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]
      if (!row || row.every((c: any) => c === null || c === '')) continue

      // Détecter la structure de la ligne
      const parsed = detectLineType(row, rowIdx, sheetName, displayOrder)
      if (parsed) {
        lines.push(parsed)
        displayOrder++
      }
    }

    if (lines.length > 0) {
      sheets.push({ name: sheetName, lines })
    }
  }

  return sheets
}

// Déclaration SheetJS pour usage côté client
declare const XLSX: any

function detectLineType(
  row: any[],
  rowIdx: number,
  sheetName: string,
  displayOrder: number
): ParsedLine | null {
  // Chercher une désignation dans les premières colonnes
  const textCols = row.filter(c => typeof c === 'string' && c.trim().length > 2)
  const numCols = row.filter(c => typeof c === 'number' && c > 0)

  if (textCols.length === 0) return null

  const designation = textCols[0]?.toString().trim() ?? null
  if (!designation) return null

  // Détecter en-tête de section (tout en majuscules, pas de valeurs numériques)
  const isSectionHeader = designation === designation.toUpperCase()
    && designation.length > 3
    && numCols.length === 0

  // Détecter sous-total (contient "total" ou "sous-total")
  const isSubtotal = /sous.{0,5}total|total\s*:/i.test(designation)

  // Chercher unité (1-5 caractères, souvent m², ml, u, kg, h, m3...)
  const unitePattern = /^(m²|m2|ml|m³|m3|u|pce|pcs|ens|kg|t|h|j|ml|ff|ft|ha|l|nb|fo|lot)$/i
  let unite: string | null = null
  let quantite: number | null = null
  let pu: number | null = null
  let montant: number | null = null

  // Stratégie : chercher les colonnes numériques en ordre (qté, pu, montant)
  const numericValues = row
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => typeof v === 'number')

  // Chercher l'unité dans les colonnes texte après la désignation
  for (let i = 1; i < row.length; i++) {
    if (typeof row[i] === 'string' && unitePattern.test(row[i].trim())) {
      unite = row[i].trim()
      break
    }
  }

  // Affecter quantité, PU, montant selon position
  if (numericValues.length >= 3) {
    quantite = numericValues[numericValues.length - 3]?.v ?? null
    pu = numericValues[numericValues.length - 2]?.v ?? null
    montant = numericValues[numericValues.length - 1]?.v ?? null
  } else if (numericValues.length === 2) {
    quantite = numericValues[0]?.v ?? null
    montant = numericValues[1]?.v ?? null
  } else if (numericValues.length === 1) {
    montant = numericValues[0]?.v ?? null
  }

  return {
    row_index: rowIdx,
    display_order: displayOrder,
    sheet_name: sheetName,
    designation,
    unite,
    quantite,
    pu,
    montant,
    is_section_header: isSectionHeader,
    is_subtotal: isSubtotal,
  }
}

// ============================================================
// MAPPING IA DES LIGNES (côté serveur)
// ============================================================
export async function mapLignesWithAI(
  lignes: Array<{ id_temp: number; designation: string | null; unite: string | null; quantite: number | null }>,
  prixClient: Array<{ designation: string; unite: string | null; pu_cible: number | null; pu_min: number | null; pu_max: number | null }>,
  docType: string
): Promise<MappingResult[]> {

  // Ne mapper que les lignes avec une désignation
  const lignesAMapper = lignes.filter(l => l.designation && l.designation.length > 3)
  if (!lignesAMapper.length) return []

  // Préparer contexte prix client
  const prixContext = prixClient.length > 0
    ? prixClient.slice(0, 50).map(p =>
        `- "${p.designation}" | ${p.unite ?? '?'} | ${p.pu_cible ? `${p.pu_cible}€` : 'PU non défini'}${p.pu_min ? ` (fourchette: ${p.pu_min}€ - ${p.pu_max}€)` : ''}`
      ).join('\n')
    : 'Aucun prix client enregistré.'

  // Traiter par batch de 20 lignes
  const results: MappingResult[] = []
  const batchSize = 20

  for (let i = 0; i < lignesAMapper.length; i += batchSize) {
    const batch = lignesAMapper.slice(i, i + batchSize)

    const lignesText = batch.map(l =>
      `[${l.id_temp}] "${l.designation}" | unité: ${l.unite ?? '?'} | qté: ${l.quantite ?? '?'}`
    ).join('\n')

    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: `Tu es expert en chiffrage de marchés publics BTP français.
Tu proposes des prix unitaires pour des prestations de ${docType}.
Réponds UNIQUEMENT en JSON valide — tableau de résultats.
Si tu n'as pas de référence fiable, indique confidence < 0.5 et source "ia_estimate".`,
        messages: [{
          role: 'user',
          content: `Voici les prix de référence de l'entreprise :
${prixContext}

Propose un PU pour chaque ligne du ${docType} :
${lignesText}

Réponds avec ce JSON :
[
  {
    "ligne_id_temp": 0,
    "matched_article": "article correspondant dans la biblio ou description similaire",
    "pu_propose": 125.50,
    "unite_propose": "m²",
    "confidence": 0.85,
    "source": "prix_client",
    "justification": "Prix issu de la référence X, cohérent avec la prestation"
  }
]
Si aucun prix possible : pu_propose = null, confidence = 0, source = "non_trouve"`,
        }],
      }),
    })

    const data = await response.json()
    const text = data.content?.find((c: any) => c.type === 'text')?.text ?? '[]'

    try {
      const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())
      results.push(...parsed)
    } catch {
      // Fallback : marquer toutes les lignes du batch comme non trouvées
      batch.forEach(l => results.push({
        ligne_id_temp: l.id_temp,
        matched_article: null,
        pu_propose: null,
        unite_propose: l.unite,
        confidence: 0,
        source: 'non_trouve',
        justification: 'Erreur de parsing IA',
      }))
    }
  }

  return results
}

// ============================================================
// DÉTECTION D'ANOMALIES
// ============================================================
export function detectAnomalies(
  lignes: Array<{
    id_temp: number
    designation: string | null
    unite: string | null
    quantite: number | null
    pu: number | null
    montant: number | null
    mapping_confidence: number
    is_section_header: boolean
    is_subtotal: boolean
  }>,
  prixClient: Array<{ designation: string; pu_min: number | null; pu_max: number | null }>
): AnomalieDetected[] {
  const anomalies: AnomalieDetected[] = []
  const designations = new Map<string, number[]>()

  // Unités reconnues (liste de référence)
  const VALID_UNITS = new Set([
    'm²','m2','ml','m³','m3','u','pce','pcs','ens','kg','t',
    'h','j','ml','ff','ft','ha','l','nb','fo','lot','forfait',
    'heure','jour','semaine','mois','an','année'
  ])

  for (const ligne of lignes) {
    if (ligne.is_section_header || ligne.is_subtotal) continue
    if (!ligne.designation) continue

    const idxs = designations.get(ligne.designation.toLowerCase()) ?? []
    idxs.push(ligne.id_temp)
    designations.set(ligne.designation.toLowerCase(), idxs)

    // 1. Unité incohérente
    if (ligne.unite && !VALID_UNITS.has(ligne.unite.toLowerCase())) {
      anomalies.push({
        ligne_index: ligne.id_temp,
        type: 'unite_incoherente',
        severity: 'attention',
        description: `Unité "${ligne.unite}" non reconnue`,
        suggestion: `Vérifier l'unité — exemples valides : m², ml, u, kg, h, forfait`,
      })
    }

    // 2. Quantité aberrante
    if (ligne.quantite !== null) {
      if (ligne.quantite === 0) {
        anomalies.push({
          ligne_index: ligne.id_temp,
          type: 'quantite_aberrante',
          severity: 'bloquante',
          description: `Quantité = 0 pour "${ligne.designation}"`,
          suggestion: 'Vérifier la quantité — une quantité nulle génère un montant nul',
        })
      } else if (ligne.quantite > 100000) {
        anomalies.push({
          ligne_index: ligne.id_temp,
          type: 'quantite_aberrante',
          severity: 'attention',
          description: `Quantité très élevée (${ligne.quantite.toLocaleString('fr-FR')}) pour "${ligne.designation?.slice(0, 50)}"`,
          suggestion: 'Vérifier si la quantité est correcte ou s\'il y a une erreur d\'import',
        })
      }
    }

    // 3. Montant zéro (avec quantité non nulle)
    if (ligne.montant === 0 && ligne.quantite && ligne.quantite > 0) {
      anomalies.push({
        ligne_index: ligne.id_temp,
        type: 'montant_zero',
        severity: 'attention',
        description: `Montant = 0 € pour "${ligne.designation?.slice(0, 50)}" (quantité: ${ligne.quantite})`,
        suggestion: 'Saisir le PU pour calculer le montant',
      })
    }

    // 4. PU hors fourchette
    if (ligne.pu !== null && ligne.pu > 0) {
      const ref = prixClient.find(p =>
        p.designation.toLowerCase().includes((ligne.designation ?? '').toLowerCase().slice(0, 10))
      )
      if (ref && ref.pu_min && ref.pu_max) {
        if (ligne.pu < ref.pu_min * 0.5 || ligne.pu > ref.pu_max * 2) {
          anomalies.push({
            ligne_index: ligne.id_temp,
            type: 'pu_hors_fourchette',
            severity: 'attention',
            description: `PU ${ligne.pu.toFixed(2)}€ hors fourchette (${ref.pu_min}€ - ${ref.pu_max}€) pour "${ligne.designation?.slice(0, 40)}"`,
            suggestion: `Fourchette de référence : ${ref.pu_min}€ - ${ref.pu_max}€`,
          })
        }
      }
    }

    // 5. Mapping incertain
    if (ligne.mapping_confidence < 0.5 && ligne.pu === null && !ligne.is_section_header) {
      anomalies.push({
        ligne_index: ligne.id_temp,
        type: 'mapping_incertain',
        severity: 'attention',
        description: `PU non trouvé pour "${ligne.designation?.slice(0, 50)}"`,
        suggestion: 'Saisir le PU manuellement',
      })
    }
  }

  // 6. Doublons
  for (const [designation, idxs] of designations.entries()) {
    if (idxs.length > 1) {
      idxs.forEach(idx => {
        anomalies.push({
          ligne_index: idx,
          type: 'doublon',
          severity: 'attention',
          description: `Désignation dupliquée "${designation.slice(0, 50)}" (${idxs.length} occurrences)`,
          suggestion: 'Vérifier si ce doublon est intentionnel',
        })
      })
    }
  }

  return anomalies
}
