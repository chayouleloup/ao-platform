/**
 * DOCX Generator
 * Génère le fichier Word du mémoire technique
 * Applique le design entreprise (logo, couleurs, styles)
 *
 * Stratégie : génère un HTML structuré → convertit en DOCX via API
 * ou stocke le contenu pour génération backend Python
 */

export interface DocxSection {
  heading: string
  level: number
  section_type: string
  content: string
  criterion_weight?: number
}

export interface DocxOptions {
  title: string
  lotTitle: string
  buyerName: string | null
  companyName: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  pageLimit: number | null
  sections: DocxSection[]
}

/**
 * Génère le payload JSON pour la génération DOCX côté serveur (Python)
 * Le worker Python utilise python-docx pour produire le fichier final
 */
export function buildDocxPayload(options: DocxOptions): object {
  return {
    meta: {
      title: options.title,
      lot_title: options.lotTitle,
      buyer_name: options.buyerName,
      company_name: options.companyName,
      logo_url: options.logoUrl,
      primary_color: options.primaryColor,
      secondary_color: options.secondaryColor,
      page_limit: options.pageLimit,
      generated_at: new Date().toISOString(),
    },
    sections: options.sections.map(s => ({
      heading: s.heading,
      level: s.level,
      type: s.section_type,
      content: s.content,
      criterion_weight: s.criterion_weight ?? null,
    })),
  }
}

/**
 * Génère un fichier HTML preview du mémoire (pour affichage dans le navigateur)
 * Structure identique au DOCX final
 */
export function generateHtmlPreview(options: DocxOptions): string {
  const primaryHex = options.primaryColor ?? '#1a56db'
  const secondaryHex = options.secondaryColor ?? '#7e3af2'

  const sectionsHtml = options.sections.map(s => {
    if (s.section_type === 'cover') {
      return `
        <div class="cover-page">
          <div class="cover-accent" style="background:${primaryHex}"></div>
          <div class="cover-content">
            <h1 class="cover-title">${escHtml(s.content.split('\n')[0]?.replace(/^#\s*/, '') ?? options.title)}</h1>
            <div class="cover-body">${markdownToHtml(s.content.split('\n').slice(1).join('\n'))}</div>
          </div>
        </div>`
    }
    if (s.section_type === 'toc') {
      const tocItems = options.sections
        .filter(sec => !['cover', 'toc'].includes(sec.section_type))
        .map(sec => `<div class="toc-item level-${sec.level}">
          <span>${escHtml(sec.heading)}</span>
          <span class="toc-dots"></span>
          <span>--</span>
        </div>`).join('')
      return `<div class="section toc"><h2 style="color:${primaryHex}">Sommaire</h2>${tocItems}</div>`
    }

    const tag = s.level === 1 ? 'h2' : 'h3'
    const weightBadge = s.criterion_weight
      ? `<span class="weight-badge" style="background:${primaryHex}20;color:${primaryHex};border:1px solid ${primaryHex}40">${s.criterion_weight}%</span>`
      : ''

    return `
      <div class="section">
        <${tag} class="section-heading" style="color:${primaryHex}">
          ${escHtml(s.heading)}${weightBadge}
        </${tag}>
        <div class="section-content">${markdownToHtml(s.content)}</div>
      </div>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #f8f9fa; }
  .document { max-width: 794px; margin: 0 auto; background: white; }
  .cover-page { min-height: 500px; padding: 60px 50px; position: relative; border-bottom: 4px solid ${primaryHex}; }
  .cover-accent { position: absolute; top: 0; left: 0; width: 8px; height: 100%; background: ${primaryHex}; }
  .cover-content { margin-left: 20px; }
  .cover-title { font-size: 22pt; font-weight: bold; color: ${primaryHex}; margin-bottom: 24px; line-height: 1.3; }
  .cover-body { font-size: 11pt; line-height: 1.8; color: #333; }
  .cover-body strong { color: ${primaryHex}; }
  .section { padding: 28px 50px; border-bottom: 1px solid #f0f0f0; }
  .toc { background: #fafafa; }
  .toc-item { display: flex; align-items: baseline; gap: 4px; padding: 3px 0; font-size: 10.5pt; }
  .toc-item.level-2 { padding-left: 20px; color: #555; font-size: 10pt; }
  .toc-dots { flex: 1; border-bottom: 1px dotted #ccc; margin: 0 4px; }
  .section-heading { font-size: 14pt; font-weight: bold; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
  h3.section-heading { font-size: 12pt; }
  .weight-badge { font-size: 9pt; font-weight: normal; padding: 2px 8px; border-radius: 4px; }
  .section-content { line-height: 1.7; color: #333; font-size: 10.5pt; }
  .section-content p { margin-bottom: 10px; }
  .section-content ul, .section-content ol { margin: 8px 0 8px 24px; }
  .section-content li { margin-bottom: 4px; }
  .missing { background: #fff3cd; border-left: 3px solid #ffc107; padding: 6px 10px; border-radius: 2px; color: #856404; font-style: italic; }
  .page-break { height: 40px; border-bottom: 2px dashed #e0e0e0; margin: 0 50px; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 9pt; }
  @media print { .page-break { display: none; } }
</style>
</head>
<body>
<div class="document">
  ${sectionsHtml}
</div>
</body>
</html>`
}

// ============================================================
// HELPERS
// ============================================================
function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function markdownToHtml(md: string): string {
  if (!md) return ''

  let html = escHtml(md)

  // Gras **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Italique *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

  // "Non précisé dans les documents" → mise en évidence
  html = html.replace(
    /Non précisé dans les documents\./g,
    '<span class="missing">⚠ Non précisé dans les documents.</span>'
  )

  // Listes à puces
  const lines = html.split('\n')
  const result: string[] = []
  let inList = false

  for (const line of lines) {
    if (line.trim().startsWith('- ')) {
      if (!inList) { result.push('<ul>'); inList = true }
      result.push(`<li>${line.trim().slice(2)}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      if (line.trim()) result.push(`<p>${line.trim()}</p>`)
    }
  }
  if (inList) result.push('</ul>')

  return result.join('\n')
}
