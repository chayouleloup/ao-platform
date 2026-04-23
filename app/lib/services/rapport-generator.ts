/**
 * Rapport de Conformité PDF
 * Généré en HTML avec rendu fidèle au PDF final
 * Contient : checklist finale, sources extractions, validations, éléments manquants
 */

export interface RapportData {
  // Identification
  project_title: string
  lot_title: string
  lot_number: number
  buyer_name: string | null
  company_name: string
  company_logo_url: string | null
  primary_color: string
  export_date: string

  // DLRO et infos clés
  dlro: { value: string | null; source_doc: string | null; source_page: string | null; confidence: number } | null
  visit_info: any
  criteria: Array<{ name: string; weight: number }>
  estimated_amount: number | null

  // Checklist finale
  checklist: Array<{
    name: string
    category: string
    character: string
    status: string
    source_ref: string | null
    document_name: string | null
    validated_at: string | null
  }>

  // Validations
  validations: Array<{
    type: string          // 'memoire' | 'prix' | 'admin'
    validated_at: string | null
    validated_by_name: string | null
    notes: string | null
  }>

  // Éléments "Non précisé"
  not_specified_items: Array<{
    field: string
    context: string
  }>

  // Points de vigilance
  warning_points: Array<{ type: string; description: string }>
}

export function generateRapportHtml(data: RapportData): string {
  const primary = data.primary_color ?? '#1a56db'
  const exportDate = new Date(data.export_date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  // Stats checklist
  const stats = {
    total: data.checklist.length,
    fourni: data.checklist.filter(i => i.status === 'fourni').length,
    manquant: data.checklist.filter(i => i.status === 'manquant' && i.character === 'obligatoire').length,
    perime: data.checklist.filter(i => i.status === 'perime').length,
    na: data.checklist.filter(i => i.status === 'non_applicable').length,
  }

  const isCompliant = stats.manquant === 0 && stats.perime === 0

  // Grouper checklist par catégorie
  const categories = {
    candidature: data.checklist.filter(i => i.category === 'candidature'),
    offre_technique: data.checklist.filter(i => i.category === 'offre_technique'),
    offre_financiere: data.checklist.filter(i => i.category === 'offre_financiere'),
    conditionnel: data.checklist.filter(i => i.category === 'conditionnel'),
  }

  const catLabels: Record<string, string> = {
    candidature: 'Candidature',
    offre_technique: 'Offre technique',
    offre_financiere: 'Offre financière',
    conditionnel: 'Conditionnel',
  }

  function statusBadge(status: string, character: string) {
    if (status === 'fourni') return `<span class="badge green">✓ Fourni</span>`
    if (status === 'perime') return `<span class="badge amber">⚠ Périmé</span>`
    if (status === 'non_applicable') return `<span class="badge gray">— N/A</span>`
    if (character === 'obligatoire') return `<span class="badge red">✗ Manquant</span>`
    return `<span class="badge gray">○ Manquant</span>`
  }

  function checklistTable(items: typeof data.checklist) {
    if (!items.length) return '<p class="empty">Aucune pièce dans cette catégorie.</p>'
    return `
      <table>
        <thead>
          <tr>
            <th style="width:40%">Pièce</th>
            <th style="width:12%">Caractère</th>
            <th style="width:18%">Statut</th>
            <th style="width:18%">Document</th>
            <th style="width:12%">Validé le</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr class="${item.status === 'manquant' && item.character === 'obligatoire' ? 'row-danger' : item.status === 'perime' ? 'row-warning' : ''}">
              <td>
                <strong>${escHtml(item.name)}</strong>
                ${item.source_ref ? `<br><small class="source">${escHtml(item.source_ref)}</small>` : ''}
              </td>
              <td><span class="char-${item.character}">${item.character === 'obligatoire' ? 'Obligatoire' : item.character === 'conditionnel' ? 'Conditionnel' : 'Recommandé'}</span></td>
              <td>${statusBadge(item.status, item.character)}</td>
              <td>${item.document_name ? `<small>${escHtml(item.document_name)}</small>` : '<small class="gray">—</small>'}</td>
              <td><small>${item.validated_at ? new Date(item.validated_at).toLocaleDateString('fr-FR') : '—'}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport de conformité — ${escHtml(data.project_title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 10pt; color: #1a1a1a; background: white; }
  .page { max-width: 794px; margin: 0 auto; padding: 40px; }

  /* COVER */
  .cover { border-bottom: 4px solid ${primary}; padding-bottom: 32px; margin-bottom: 32px; }
  .cover-accent { display: inline-block; width: 6px; height: 48px; background: ${primary}; vertical-align: middle; margin-right: 16px; }
  .cover-title { font-size: 20pt; font-weight: bold; color: ${primary}; display: inline; vertical-align: middle; }
  .cover-meta { margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .meta-item { }
  .meta-label { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #888; }
  .meta-value { font-size: 10pt; font-weight: 600; color: #1a1a1a; margin-top: 2px; }

  /* COMPLIANCE BANNER */
  .compliance-banner { padding: 16px 20px; border-radius: 8px; margin-bottom: 28px; display: flex; align-items: center; gap: 16px; }
  .compliance-banner.ok { background: #f0fdf4; border: 2px solid #22c55e; }
  .compliance-banner.nok { background: #fef2f2; border: 2px solid #ef4444; }
  .compliance-icon { font-size: 28pt; }
  .compliance-text h3 { font-size: 13pt; font-weight: bold; }
  .compliance-text p { font-size: 9pt; color: #555; margin-top: 2px; }

  /* STATS */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .stat-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
  .stat-number { font-size: 24pt; font-weight: bold; }
  .stat-label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: .05em; }

  /* SECTIONS */
  h2 { font-size: 13pt; font-weight: bold; color: ${primary}; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid ${primary}20; }
  h3 { font-size: 11pt; font-weight: 600; color: #333; margin: 18px 0 8px; background: #f8f9fa; padding: 8px 12px; border-radius: 4px; border-left: 4px solid ${primary}; }

  /* TABLES */
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 16px; }
  thead tr { background: ${primary}15; }
  th { padding: 8px 10px; text-align: left; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: ${primary}; border-bottom: 2px solid ${primary}30; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .row-danger td { background: #fef2f2; }
  .row-warning td { background: #fffbeb; }
  .gray { color: #9ca3af; }
  small { font-size: 8pt; }
  .source { color: #6b7280; font-style: italic; }

  /* BADGES */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 600; }
  .badge.green { background: #dcfce7; color: #166534; }
  .badge.red { background: #fee2e2; color: #991b1b; }
  .badge.amber { background: #fef9c3; color: #854d0e; }
  .badge.gray { background: #f3f4f6; color: #6b7280; }
  .char-obligatoire { color: #dc2626; font-size: 8pt; font-weight: 600; }
  .char-conditionnel { color: #d97706; font-size: 8pt; }
  .char-recommande { color: #9ca3af; font-size: 8pt; }

  /* INFOS CLÉS */
  .key-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 28px; }
  .key-info-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
  .key-info-card.highlight { border-color: ${primary}50; background: ${primary}05; }
  .key-info-label { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-bottom: 4px; }
  .key-info-value { font-size: 11pt; font-weight: 700; color: #1a1a1a; }
  .key-info-sub { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .confidence-bar { height: 4px; border-radius: 2px; background: #e5e7eb; margin-top: 6px; }
  .confidence-fill { height: 100%; border-radius: 2px; background: ${primary}; }

  /* VALIDATIONS */
  .validation-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
  .validation-icon { font-size: 16pt; width: 28px; text-align: center; }
  .validation-info { flex: 1; }
  .validation-name { font-weight: 600; font-size: 9.5pt; }
  .validation-meta { font-size: 8.5pt; color: #6b7280; margin-top: 1px; }

  /* NOT SPECIFIED */
  .not-specified-item { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; }
  .not-specified-field { font-weight: 600; font-size: 9pt; color: #92400e; }
  .not-specified-ctx { font-size: 8.5pt; color: #78716c; margin-top: 2px; }

  /* WARNINGS */
  .warning-item { padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; }
  .warning-eliminatoire { background: #fef2f2; border-left: 4px solid #ef4444; }
  .warning-critique { background: #fffbeb; border-left: 4px solid #f59e0b; }
  .warning-attention { background: #eff6ff; border-left: 4px solid #3b82f6; }
  .warning-type { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  .warning-desc { font-size: 9pt; margin-top: 2px; }

  /* FOOTER */
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 8pt; color: #9ca3af; }

  .empty { color: #9ca3af; font-style: italic; font-size: 9pt; padding: 8px 0; }

  @media print {
    .page { padding: 20px; }
    h2 { page-break-before: auto; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- COVER -->
  <div class="cover">
    <div>
      <span class="cover-accent"></span>
      <span class="cover-title">Rapport de conformité</span>
    </div>
    <div class="cover-meta">
      <div class="meta-item">
        <div class="meta-label">Marché</div>
        <div class="meta-value">${escHtml(data.project_title)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Lot</div>
        <div class="meta-value">Lot ${data.lot_number} — ${escHtml(data.lot_title)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Acheteur</div>
        <div class="meta-value">${escHtml(data.buyer_name ?? 'Non précisé')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Soumissionnaire</div>
        <div class="meta-value">${escHtml(data.company_name)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Date d'export</div>
        <div class="meta-value">${exportDate}</div>
      </div>
      ${data.dlro?.value ? `
      <div class="meta-item">
        <div class="meta-label">DLRO</div>
        <div class="meta-value" style="color:${primary}">${new Date(data.dlro.value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${new Date(data.dlro.value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- COMPLIANCE BANNER -->
  <div class="compliance-banner ${isCompliant ? 'ok' : 'nok'}">
    <div class="compliance-icon">${isCompliant ? '✅' : '🚫'}</div>
    <div class="compliance-text">
      <h3 style="color:${isCompliant ? '#166534' : '#991b1b'}">${isCompliant ? 'Dossier conforme — Export autorisé' : 'Dossier incomplet — Export bloqué'}</h3>
      <p>${isCompliant
        ? `${stats.fourni} pièce${stats.fourni > 1 ? 's' : ''} fournie${stats.fourni > 1 ? 's' : ''} · Toutes les pièces obligatoires sont présentes`
        : `${stats.manquant} pièce${stats.manquant > 1 ? 's' : ''} obligatoire${stats.manquant > 1 ? 's' : ''} manquante${stats.manquant > 1 ? 's' : ''}${stats.perime > 0 ? ` · ${stats.perime} périmée${stats.perime > 1 ? 's' : ''}` : ''}`
      }</p>
    </div>
  </div>

  <!-- STATS CHECKLIST -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-number" style="color:#1a1a1a">${stats.total}</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" style="color:#166534">${stats.fourni}</div>
      <div class="stat-label">Fournies</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" style="color:${stats.manquant > 0 ? '#991b1b' : '#9ca3af'}">${stats.manquant}</div>
      <div class="stat-label">Manquantes</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" style="color:${stats.perime > 0 ? '#854d0e' : '#9ca3af'}">${stats.perime}</div>
      <div class="stat-label">Périmées</div>
    </div>
  </div>

  <!-- INFOS CLÉS EXTRAITES -->
  <h2>1. Informations clés du marché</h2>
  <div class="key-info-grid">
    ${data.dlro ? `
    <div class="key-info-card highlight">
      <div class="key-info-label">📅 Date limite de remise des offres (DLRO)</div>
      <div class="key-info-value">${data.dlro.value ? new Date(data.dlro.value).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Non précisé'}</div>
      ${data.dlro.value ? `<div class="key-info-sub">à ${new Date(data.dlro.value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>` : ''}
      ${data.dlro.source_doc ? `<div class="key-info-sub" style="color:#6b7280">Source : ${escHtml(data.dlro.source_doc)}${data.dlro.source_page ? ` · ${escHtml(data.dlro.source_page)}` : ''}</div>` : ''}
      <div class="confidence-bar"><div class="confidence-fill" style="width:${Math.round((data.dlro.confidence ?? 0) * 100)}%"></div></div>
    </div>` : ''}
    ${data.visit_info ? `
    <div class="key-info-card">
      <div class="key-info-label">🏗️ Visite de site</div>
      <div class="key-info-value">${data.visit_info.mandatory?.value === true ? 'Obligatoire' : data.visit_info.mandatory?.value === false ? 'Facultative' : 'Non précisé'}</div>
      ${data.visit_info.date?.value ? `<div class="key-info-sub">Le ${new Date(data.visit_info.date.value).toLocaleDateString('fr-FR')}</div>` : ''}
      ${data.visit_info.contact?.value ? `<div class="key-info-sub">Contact : ${escHtml(data.visit_info.contact.value)}</div>` : ''}
      ${data.visit_info.attestation_required?.value ? `<div class="key-info-sub" style="color:#dc2626;font-weight:600">Attestation requise !</div>` : ''}
    </div>` : ''}
    ${data.estimated_amount ? `
    <div class="key-info-card">
      <div class="key-info-label">💶 Montant estimé</div>
      <div class="key-info-value">${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(data.estimated_amount)}</div>
    </div>` : ''}
  </div>

  ${data.criteria.length > 0 ? `
  <h3>Critères de jugement</h3>
  <table>
    <thead><tr><th>Critère</th><th style="width:15%">Pondération</th></tr></thead>
    <tbody>
      ${data.criteria.map(c => `<tr><td>${escHtml(c.name)}</td><td><strong style="color:${primary}">${c.weight}%</strong></td></tr>`).join('')}
    </tbody>
  </table>` : ''}

  <!-- CHECKLIST COMPLÈTE -->
  <h2>2. Checklist des pièces à fournir</h2>
  ${Object.entries(categories).map(([catKey, items]) => {
    if (!items.length) return ''
    return `
    <h3>${catLabels[catKey] ?? catKey}</h3>
    ${checklistTable(items)}`
  }).join('')}

  <!-- VALIDATIONS -->
  ${data.validations.length > 0 ? `
  <h2>3. Historique des validations</h2>
  ${data.validations.map(v => `
    <div class="validation-row">
      <div class="validation-icon">${v.validated_at ? '✅' : '⏳'}</div>
      <div class="validation-info">
        <div class="validation-name">${v.type === 'memoire' ? 'Mémoire technique' : v.type === 'prix' ? 'Offre financière' : 'Pièces administratives'}</div>
        <div class="validation-meta">
          ${v.validated_at ? `Validé le ${new Date(v.validated_at).toLocaleDateString('fr-FR')} par ${escHtml(v.validated_by_name ?? 'Utilisateur')}` : 'Non validé'}
          ${v.notes ? ` · Note : "${escHtml(v.notes)}"` : ''}
        </div>
      </div>
    </div>
  `).join('')}` : ''}

  <!-- POINTS DE VIGILANCE -->
  ${data.warning_points.length > 0 ? `
  <h2>4. Points de vigilance</h2>
  ${data.warning_points.map(w => `
    <div class="warning-item warning-${w.type}">
      <div class="warning-type">${w.type === 'eliminatoire' ? '🚫 Éliminatoire' : w.type === 'critique' ? '⚠️ Critique' : 'ℹ️ Attention'}</div>
      <div class="warning-desc">${escHtml(w.description)}</div>
    </div>
  `).join('')}` : ''}

  <!-- NON PRÉCISÉS -->
  ${data.not_specified_items.length > 0 ? `
  <h2>5. Éléments "Non précisé dans les documents"</h2>
  <p style="font-size:9pt;color:#6b7280;margin-bottom:12px">Ces éléments ont été signalés comme non trouvés dans les documents importés. Vérifiez qu'ils ne sont pas requis par l'acheteur.</p>
  ${data.not_specified_items.map(item => `
    <div class="not-specified-item">
      <div class="not-specified-field">${escHtml(item.field)}</div>
      <div class="not-specified-ctx">${escHtml(item.context)}</div>
    </div>
  `).join('')}` : ''}

  <!-- FOOTER -->
  <div class="footer">
    <span>Rapport généré par AO Platform · ${exportDate}</span>
    <span>Document confidentiel — ${escHtml(data.company_name)}</span>
  </div>

</div>
</body>
</html>`
}

function escHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
