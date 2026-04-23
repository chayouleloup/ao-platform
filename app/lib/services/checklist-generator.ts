/**
 * Checklist Generator
 * Génère les items de checklist depuis :
 *  1. L'extraction IA (required_docs du RC)
 *  2. Les livrables internes (mémoire, AE, DPGF, DC1, DC2)
 *  3. Les conditions détectées (visite, variantes...)
 */

import type { ChecklistCategory, ItemCharacter } from '@/types/conformite'

export interface ChecklistItemInput {
  name: string
  category: ChecklistCategory
  character: ItemCharacter
  scope: 'commun' | 'lot'
  source_type: 'ia' | 'template' | 'manuel'
  source_ref?: string
  dce_doc_type?: string
  expected_format?: string
  format_notes?: string
  linked_output?: string
  display_order: number
}

/**
 * Génère les items de checklist depuis l'extraction DCE + règles métier
 */
export function generateChecklistItems(
  extraction: any,
  lotNumber: number,
  options: {
    hasVisit: boolean
    visitMandatory: boolean
    visitAttestationRequired: boolean
    isAllotted: boolean
  }
): ChecklistItemInput[] {
  const items: ChecklistItemInput[] = []
  let order = 0

  // ============================================================
  // 1. PIÈCES ISSUES DE L'EXTRACTION IA (required_docs)
  // ============================================================
  const requiredDocs = extraction?.required_docs?.value

  if (requiredDocs) {
    // CANDIDATURE
    const candidatureDocs = requiredDocs.candidature ?? []
    candidatureDocs.forEach((doc: any) => {
      items.push({
        name: doc.name,
        category: 'candidature',
        character: doc.mandatory ? 'obligatoire' : 'conditionnel',
        scope: 'commun',
        source_type: 'ia',
        source_ref: doc.source_page ?? undefined,
        expected_format: doc.format ?? undefined,
        format_notes: doc.notes ?? undefined,
        display_order: order++,
      })
    })

    // OFFRE TECHNIQUE
    const offTechDocs = requiredDocs.offre_technique ?? []
    offTechDocs.forEach((doc: any) => {
      items.push({
        name: doc.name,
        category: 'offre_technique',
        character: doc.mandatory ? 'obligatoire' : 'conditionnel',
        scope: 'lot',
        source_type: 'ia',
        source_ref: doc.source_page ?? undefined,
        expected_format: doc.format ?? undefined,
        format_notes: doc.notes ?? undefined,
        linked_output: doc.name.toLowerCase().includes('mémoire') ? 'memoire' : undefined,
        display_order: order++,
      })
    })

    // OFFRE FINANCIÈRE
    const offFinDocs = requiredDocs.offre_financiere ?? []
    offFinDocs.forEach((doc: any) => {
      items.push({
        name: doc.name,
        category: 'offre_financiere',
        character: doc.mandatory ? 'obligatoire' : 'conditionnel',
        scope: 'lot',
        source_type: 'ia',
        source_ref: doc.source_page ?? undefined,
        expected_format: doc.format ?? undefined,
        format_notes: doc.notes ?? undefined,
        linked_output: /dpgf|bpu|dqe/i.test(doc.name) ? 'dpgf' : /acte.{0,10}engagement|ae\b/i.test(doc.name) ? 'ae' : undefined,
        display_order: order++,
      })
    })

    // CONDITIONNEL
    const conditionalDocs = requiredDocs.conditionnel ?? []
    conditionalDocs.forEach((doc: any) => {
      items.push({
        name: doc.name,
        category: 'conditionnel',
        character: 'conditionnel',
        scope: 'lot',
        source_type: 'ia',
        source_ref: doc.source_page ?? undefined,
        expected_format: doc.format ?? undefined,
        format_notes: doc.notes ?? undefined,
        display_order: order++,
      })
    })
  }

  // ============================================================
  // 2. LIVRABLES INTERNES TOUJOURS PRÉSENTS (template)
  // ============================================================

  // DC1 — toujours présent si pas déjà dans l'extraction
  if (!items.some(i => /dc1/i.test(i.name))) {
    items.push({
      name: 'DC1 — Lettre de candidature (habilitation)',
      category: 'candidature',
      character: 'obligatoire',
      scope: 'commun',
      source_type: 'template',
      expected_format: 'PDF',
      linked_output: 'dc1',
      display_order: order++,
    })
  }

  // DC2 — toujours présent si pas déjà dans l'extraction
  if (!items.some(i => /dc2/i.test(i.name))) {
    items.push({
      name: 'DC2 — Déclaration du candidat',
      category: 'candidature',
      character: 'obligatoire',
      scope: 'commun',
      source_type: 'template',
      expected_format: 'PDF',
      linked_output: 'dc2',
      display_order: order++,
    })
  }

  // Mémoire technique — toujours attendu si pas déjà extrait
  if (!items.some(i => i.linked_output === 'memoire')) {
    items.push({
      name: 'Mémoire technique',
      category: 'offre_technique',
      character: 'obligatoire',
      scope: 'lot',
      source_type: 'template',
      expected_format: 'PDF',
      linked_output: 'memoire',
      display_order: order++,
    })
  }

  // Acte d'engagement — toujours présent
  if (!items.some(i => i.linked_output === 'ae')) {
    items.push({
      name: 'Acte d\'engagement (AE)',
      category: 'offre_financiere',
      character: 'obligatoire',
      scope: 'lot',
      source_type: 'template',
      expected_format: 'PDF',
      linked_output: 'ae',
      display_order: order++,
    })
  }

  // ============================================================
  // 3. CONDITIONS DÉTECTÉES
  // ============================================================

  // Attestation de visite (si visite obligatoire + attestation requise)
  if (options.visitMandatory && options.visitAttestationRequired) {
    if (!items.some(i => /attestation.{0,10}visite/i.test(i.name))) {
      items.push({
        name: 'Attestation de visite (obligatoire)',
        category: 'conditionnel',
        character: 'obligatoire',  // devient obligatoire si visite obligatoire
        scope: 'lot',
        source_type: 'ia',
        format_notes: 'À obtenir lors de la visite et à joindre au dossier',
        display_order: order++,
      })
    }
  }

  // Attestation URSSAF / fiscale (template systématique)
  if (!items.some(i => /urssaf/i.test(i.name))) {
    items.push({
      name: 'Attestation de vigilance URSSAF',
      category: 'candidature',
      character: 'obligatoire',
      scope: 'commun',
      source_type: 'template',
      expected_format: 'PDF',
      display_order: order++,
    })
  }

  if (!items.some(i => /fiscal|imp[oô]t/i.test(i.name))) {
    items.push({
      name: 'Attestation fiscale (DGFiP)',
      category: 'candidature',
      character: 'obligatoire',
      scope: 'commun',
      source_type: 'template',
      expected_format: 'PDF',
      display_order: order++,
    })
  }

  // Assurance RC Pro
  if (!items.some(i => /assurance|rc.{0,5}pro/i.test(i.name))) {
    items.push({
      name: 'Attestation assurance RC Professionnelle',
      category: 'candidature',
      character: 'obligatoire',
      scope: 'commun',
      source_type: 'template',
      expected_format: 'PDF',
      display_order: order++,
    })
  }

  // Déprioritiser (déplacer en bas) les recommandés
  return items.sort((a, b) => {
    const orderChar = { obligatoire: 0, conditionnel: 1, recommande: 2 }
    const orderCat = { candidature: 0, offre_technique: 1, offre_financiere: 2, conditionnel: 3 }
    if (orderCat[a.category] !== orderCat[b.category]) return orderCat[a.category] - orderCat[b.category]
    if (orderChar[a.character] !== orderChar[b.character]) return orderChar[a.character] - orderChar[b.character]
    return a.display_order - b.display_order
  })
}
