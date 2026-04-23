/**
 * Pack Builder
 * Construit le manifest du pack candidature ZIP
 * Structure : 01_Candidature / 02_Offre_Technique / 03_Offre_Financiere / 04_Annexes
 */

export interface PackItem {
  name: string                // nom du fichier dans le ZIP
  original_url: string | null // URL source
  category: '01_Candidature' | '02_Offre_Technique' | '03_Offre_Financiere' | '04_Annexes'
  lot: string
  status: 'fourni' | 'genere' | 'manquant'
  source_type: 'upload' | 'livrable_genere' | 'template'
  size?: number
}

export interface PackManifest {
  project_title: string
  lot_title: string
  lot_number: number
  company_name: string
  export_date: string
  items: PackItem[]
  total_files: number
  missing_files: string[]
}

/**
 * Construit le manifest du pack depuis les données de la DB
 */
export function buildPackManifest(params: {
  projectTitle: string
  lotTitle: string
  lotNumber: number
  companyName: string
  checklistItems: Array<{
    name: string
    category: string
    status: string
    character: string
    document_url: string | null
    document_name: string | null
    linked_output: string | null
  }>
  memoire: { docx_url: string | null; pdf_url: string | null; status: string } | null
  prixFichier: { output_file_url: string | null; file_url: string | null; status: string } | null
  rapportPdfUrl?: string
}): PackManifest {

  const items: PackItem[] = []
  const missing: string[] = []

  for (const item of params.checklistItems) {
    if (item.status === 'non_applicable') continue

    // Mapper catégorie checklist → dossier ZIP
    const categoryMap: Record<string, PackItem['category']> = {
      candidature:      '01_Candidature',
      offre_technique:  '02_Offre_Technique',
      offre_financiere: '03_Offre_Financiere',
      conditionnel:     '04_Annexes',
    }
    const category = categoryMap[item.category] ?? '04_Annexes'

    // Déterminer l'URL selon le type de livrable
    let url: string | null = item.document_url
    let sourceType: PackItem['source_type'] = 'upload'

    if (item.linked_output === 'memoire' && params.memoire?.pdf_url) {
      url = params.memoire.pdf_url
      sourceType = 'livrable_genere'
    } else if (item.linked_output === 'memoire' && params.memoire?.docx_url) {
      url = params.memoire.docx_url
      sourceType = 'livrable_genere'
    } else if ((item.linked_output === 'dpgf' || item.linked_output === 'ae') && params.prixFichier) {
      url = params.prixFichier.output_file_url ?? params.prixFichier.file_url
      sourceType = 'livrable_genere'
    }

    const fileName = sanitizeFileName(item.document_name ?? item.name)
    const status = item.status === 'fourni' ? (url ? 'fourni' : 'genere') : 'manquant'

    if (status === 'manquant' && item.character === 'obligatoire') {
      missing.push(item.name)
    }

    items.push({
      name: `${category}/${fileName}`,
      original_url: url,
      category,
      lot: `Lot ${params.lotNumber}`,
      status,
      source_type: sourceType,
    })
  }

  // Ajouter le rapport de conformité dans les annexes
  if (params.rapportPdfUrl) {
    items.push({
      name: `04_Annexes/Rapport_de_conformite_Lot${params.lotNumber}.pdf`,
      original_url: params.rapportPdfUrl,
      category: '04_Annexes',
      lot: `Lot ${params.lotNumber}`,
      status: 'genere',
      source_type: 'livrable_genere',
    })
  }

  return {
    project_title: params.projectTitle,
    lot_title: params.lotTitle,
    lot_number: params.lotNumber,
    company_name: params.companyName,
    export_date: new Date().toISOString(),
    items,
    total_files: items.filter(i => i.status !== 'manquant').length,
    missing_files: missing,
  }
}

/**
 * Génère l'index des pièces (fichier texte inclus dans le ZIP)
 */
export function generatePackIndex(manifest: PackManifest): string {
  const date = new Date(manifest.export_date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  const lines = [
    '════════════════════════════════════════════════════════',
    '  INDEX DU PACK CANDIDATURE',
    '════════════════════════════════════════════════════════',
    `  Marché    : ${manifest.project_title}`,
    `  Lot       : Lot ${manifest.lot_number} — ${manifest.lot_title}`,
    `  Entreprise: ${manifest.company_name}`,
    `  Exporté le: ${date}`,
    `  Fichiers  : ${manifest.total_files}`,
    manifest.missing_files.length > 0
      ? `  ⚠ Manquants: ${manifest.missing_files.length} pièce(s) obligatoire(s)`
      : `  ✓ Conformité: Toutes les pièces obligatoires sont présentes`,
    '',
    '════════════════════════════════════════════════════════',
    '',
  ]

  const categories = ['01_Candidature', '02_Offre_Technique', '03_Offre_Financiere', '04_Annexes'] as const
  const catLabels = {
    '01_Candidature': 'CANDIDATURE',
    '02_Offre_Technique': 'OFFRE TECHNIQUE',
    '03_Offre_Financiere': 'OFFRE FINANCIÈRE',
    '04_Annexes': 'ANNEXES',
  }

  for (const cat of categories) {
    const catItems = manifest.items.filter(i => i.category === cat)
    if (!catItems.length) continue

    lines.push(`┌─ ${catLabels[cat]} (${catItems.length} fichier${catItems.length > 1 ? 's' : ''})`)
    catItems.forEach((item, idx) => {
      const isLast = idx === catItems.length - 1
      const prefix = isLast ? '└──' : '├──'
      const statusIcon = item.status === 'manquant' ? '✗' : item.status === 'genere' ? '◉' : '✓'
      const fileName = item.name.split('/').pop() ?? item.name
      lines.push(`${prefix} ${statusIcon} ${fileName}`)
    })
    lines.push('')
  }

  if (manifest.missing_files.length > 0) {
    lines.push('════════════════════════════════════════════════════════')
    lines.push('  ⚠ PIÈCES MANQUANTES (à compléter avant dépôt)')
    lines.push('════════════════════════════════════════════════════════')
    manifest.missing_files.forEach(f => lines.push(`  • ${f}`))
    lines.push('')
  }

  lines.push('════════════════════════════════════════════════════════')
  lines.push('  Généré par AO Platform — Document confidentiel')
  lines.push('════════════════════════════════════════════════════════')

  return lines.join('\n')
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}
