'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

// ============================================================
// PIÈCES ADMIN — Génération DC1/DC2/AE préremplis
// ============================================================
export async function generatePieceAdmin(params: { projectId: string; lotId: string; pieceType: 'DC1' | 'DC2' | 'AE' }) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }
  const supabase = await createClient()

  const [{ data: company }, { data: project }, { data: lot }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', user.company.id).single(),
    supabase.from('projects').select('title, buyer_name, dlro, estimated_amount').eq('id', params.projectId).single(),
    supabase.from('lots').select('number, title').eq('id', params.lotId).single(),
  ])

  let html = ''

  if (params.pieceType === 'DC1') {
    html = generateDC1Html({ company, project, lot })
  } else if (params.pieceType === 'DC2') {
    html = generateDC2Html({ company, project, lot })
  } else if (params.pieceType === 'AE') {
    html = generateAEHtml({ company, project, lot })
  }

  const { data, error } = await supabase.from('pieces_admin').upsert({
    project_id: params.projectId,
    lot_id: params.lotId,
    company_id: user.company.id,
    piece_type: params.pieceType,
    html_content: html,
    status: 'brouillon',
  }, { onConflict: 'project_id,lot_id,piece_type' }).select().single()

  if (error) return { error: error.message }

  // Mettre à jour la checklist
  await supabase.from('checklist_items').update({ status: 'fourni', validated_at: new Date().toISOString() })
    .eq('lot_id', params.lotId).eq('company_id', user.company.id).eq('linked_output', params.pieceType.toLowerCase())

  revalidatePath(`/projets/${params.projectId}/admin`)
  return { success: true, html, id: data.id }
}

function generateDC1Html({ company, project, lot }: any) {
  const c = company ?? {}
  const p = project ?? {}
  const l = lot ?? {}
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; max-width: 750px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 14pt; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
    h2 { font-size: 11pt; background: #e8e8e8; padding: 4px 8px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td, th { border: 1px solid #999; padding: 6px 8px; font-size: 9.5pt; }
    th { background: #f0f0f0; font-weight: bold; width: 35%; }
    .field-empty { background: #fffbe6; color: #856404; }
    .signature-box { height: 80px; border: 1px solid #999; margin-top: 8px; padding: 8px; font-size: 8.5pt; color: #666; }
  </style></head><body>
    <h1>DC1 — Lettre de candidature et habilitation du mandataire par ses co-traitants</h1>
    <p style="text-align:center;font-size:9pt;color:#555">Formulaire prérempli par AO Platform — À vérifier avant dépôt</p>

    <h2>1. Identification du pouvoir adjudicateur</h2>
    <table>
      <tr><th>Acheteur public</th><td>${p.buyer_name ?? '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
      <tr><th>Objet du marché</th><td>${p.title ?? '<span class="field-empty">⚠ À compléter</span>'} — Lot ${l.number ?? '?'} : ${l.title ?? ''}</td></tr>
    </table>

    <h2>2. Identification du candidat</h2>
    <table>
      <tr><th>Raison sociale</th><td><strong>${c.name ?? ''}</strong></td></tr>
      <tr><th>Forme juridique</th><td>${c.legal_form ?? ''}</td></tr>
      <tr><th>SIRET</th><td>${c.siret ?? '<span class="field-empty">⚠ Non renseigné</span>'}</td></tr>
      <tr><th>APE</th><td>${c.ape_code ?? ''}</td></tr>
      <tr><th>Adresse</th><td>${[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || '<span class="field-empty">⚠ Non renseignée</span>'}</td></tr>
      <tr><th>TVA intracommunautaire</th><td>${c.tva_number ?? ''}</td></tr>
    </table>

    <h2>3. Déclaration</h2>
    <p style="font-size:9.5pt;line-height:1.6">Le candidat déclare sur l'honneur :</p>
    <ul style="font-size:9.5pt;line-height:1.8">
      <li>Ne pas avoir fait l'objet, au cours des cinq dernières années, d'une condamnation inscrite au bulletin n° 2 du casier judiciaire pour les infractions visées aux articles L. 8221-1, L. 8221-3, L. 8221-5, L. 8231-1, L. 8241-1 et L. 8251-1 du code du travail ;</li>
      <li>Être en règle, au cours de l'année précédant la date limite de remise des candidatures, au regard des articles L. 5212-1 à L. 5212-11 du code du travail ;</li>
      <li>Avoir souscrit les déclarations lui incombant en matière fiscale et sociale ou avoir procédé au paiement des impôts, taxes, cotisations.</li>
    </ul>

    <h2>4. Signature</h2>
    <table>
      <tr><th>Nom et qualité du signataire</th><td>${c.ao_contact_name ?? '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
      <tr><th>Date</th><td>${new Date().toLocaleDateString('fr-FR')}</td></tr>
    </table>
    <div class="signature-box">Signature (manuscrite ou électronique selon exigence du RC)</div>
  </body></html>`
}

function generateDC2Html({ company, project, lot }: any) {
  const c = company ?? {}
  const p = project ?? {}
  const l = lot ?? {}
  const currentYear = new Date().getFullYear()
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; max-width: 750px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 14pt; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
    h2 { font-size: 11pt; background: #e8e8e8; padding: 4px 8px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td, th { border: 1px solid #999; padding: 6px 8px; font-size: 9.5pt; }
    th { background: #f0f0f0; width: 40%; }
    .field-empty { background: #fffbe6; color: #856404; }
  </style></head><body>
    <h1>DC2 — Déclaration du candidat individuel ou du membre du groupement</h1>
    <p style="text-align:center;font-size:9pt;color:#555">Marché : ${p.title ?? ''} — Lot ${l.number ?? '?'} : ${l.title ?? ''}</p>

    <h2>A — Renseignements concernant la situation juridique</h2>
    <table>
      <tr><th>Raison sociale</th><td><strong>${c.name ?? ''}</strong></td></tr>
      <tr><th>Code APE</th><td>${c.ape_code ?? ''}</td></tr>
      <tr><th>N° SIRET</th><td>${c.siret ?? '<span class="field-empty">⚠ Non renseigné</span>'}</td></tr>
      <tr><th>N° TVA intracommunautaire</th><td>${c.tva_number ?? ''}</td></tr>
      <tr><th>Forme juridique</th><td>${c.legal_form ?? ''}</td></tr>
      <tr><th>Adresse</th><td>${[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || ''}</td></tr>
    </table>

    <h2>B — Capacités économiques et financières</h2>
    <table>
      <tr><th>Chiffre d'affaires ${currentYear - 1}</th><td>${c.revenue_n1 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c.revenue_n1) : '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
      <tr><th>Chiffre d'affaires ${currentYear - 2}</th><td>${c.revenue_n2 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c.revenue_n2) : '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
      <tr><th>Chiffre d'affaires ${currentYear - 3}</th><td>${c.revenue_n3 ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c.revenue_n3) : '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
    </table>

    <h2>C — Références (marchés exécutés au cours des 3 dernières années)</h2>
    <table>
      <tr><th style="width:30%">Nature des travaux / prestations</th><th>Maître d'ouvrage</th><th>Montant (€ HT)</th><th>Date d'exécution</th></tr>
      <tr><td><em style="color:#aaa">À compléter depuis vos références</em></td><td></td><td></td><td></td></tr>
      <tr><td></td><td></td><td></td><td></td></tr>
      <tr><td></td><td></td><td></td><td></td></tr>
    </table>

    <h2>D — Signature</h2>
    <table>
      <tr><th>Nom / Qualité du signataire</th><td>${c.ao_contact_name ?? '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
      <tr><th>Date</th><td>${new Date().toLocaleDateString('fr-FR')}</td></tr>
    </table>
  </body></html>`
}

function generateAEHtml({ company, project, lot }: any) {
  const c = company ?? {}
  const p = project ?? {}
  const l = lot ?? {}
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><style>
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; max-width: 750px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 14pt; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
    h2 { font-size: 11pt; background: #e8e8e8; padding: 4px 8px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    td, th { border: 1px solid #999; padding: 6px 8px; font-size: 9.5pt; }
    th { background: #f0f0f0; width: 40%; }
    .montant-box { border: 2px solid #000; padding: 16px; text-align: center; font-size: 18pt; font-weight: bold; margin: 16px 0; }
    .field-empty { background: #fffbe6; color: #856404; }
  </style></head><body>
    <h1>ACTE D'ENGAGEMENT</h1>
    <p style="text-align:center">Marché : <strong>${p.title ?? ''}</strong></p>
    <p style="text-align:center">Lot ${l.number ?? '?'} — ${l.title ?? ''}</p>

    <h2>1. Identification du pouvoir adjudicateur</h2>
    <table>
      <tr><th>Acheteur</th><td><strong>${p.buyer_name ?? '<span class="field-empty">⚠ Non renseigné</span>'}</strong></td></tr>
      <tr><th>Objet du marché</th><td>${p.title ?? ''}</td></tr>
    </table>

    <h2>2. Identification du titulaire</h2>
    <table>
      <tr><th>Raison sociale</th><td><strong>${c.name ?? ''}</strong></td></tr>
      <tr><th>SIRET</th><td>${c.siret ?? '<span class="field-empty">⚠ Non renseigné</span>'}</td></tr>
      <tr><th>Adresse</th><td>${[c.address, c.postal_code, c.city].filter(Boolean).join(', ') || ''}</td></tr>
    </table>

    <h2>3. Engagement</h2>
    <p style="font-size:9.5pt;line-height:1.7">Après avoir pris connaissance des pièces constitutives du marché et conformément aux clauses et conditions fixées, le soussigné s'engage, sur la base de son offre, à exécuter les prestations objet du marché pour le prix suivant :</p>

    <div class="montant-box">
      Montant total HT : <span class="field-empty">____________________ €</span><br>
      <span style="font-size:11pt">TVA (20%) : ____________________ €</span><br>
      <span style="font-size:11pt">Montant total TTC : ____________________ €</span>
    </div>
    <p style="font-size:8.5pt;color:#666;text-align:center">* Renseigner le montant issu de l'offre financière (DPGF/BPU/DQE)</p>

    <h2>4. Délai d'exécution</h2>
    <table>
      <tr><th>Durée du marché</th><td><span class="field-empty">⚠ À compléter</span></td></tr>
      <tr><th>Date prévisionnelle de début</th><td><span class="field-empty">⚠ À compléter</span></td></tr>
    </table>

    <h2>5. Paiement</h2>
    <table>
      <tr><th>Domiciliation bancaire (IBAN)</th><td><span class="field-empty">⚠ À compléter</span></td></tr>
      <tr><th>BIC</th><td></td></tr>
    </table>

    <h2>6. Signature du candidat</h2>
    <table>
      <tr><th>Nom / Qualité du signataire</th><td>${c.ao_contact_name ?? '<span class="field-empty">⚠ À compléter</span>'}</td></tr>
      <tr><th>Date</th><td>${new Date().toLocaleDateString('fr-FR')}</td></tr>
      <tr><th>Signature</th><td style="height:60px"></td></tr>
    </table>
  </body></html>`
}

// ============================================================
// SOURCING AO — Recherche et alertes
// ============================================================
export async function searchAOs(params: { keywords?: string; departments?: string[]; regions?: string[] }) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }

  // Recherche via BOAMP API (simulée — nécessite un accord commercial)
  // En production : appel à l'API BOAMP, PLACE, ou un agrégateur
  // Pour la démo, on génère des résultats pertinents via IA
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1500,
      system: 'Tu génères des exemples réalistes d\'appels d\'offres publics français. Réponds UNIQUEMENT en JSON.',
      messages: [{ role: 'user', content: `Génère 6 exemples réalistes d'AO publics français pour les mots-clés : "${params.keywords ?? 'travaux'}". Retourne un JSON : [{ "title": "...", "buyer_name": "...", "location": "...", "estimated_amount": 250000, "dlro": "2026-06-15T12:00:00", "cpv": "45000000-7", "source_url": "https://www.boamp.fr/..." }]` }],
    }),
  })
  const data = await response.json()
  const text = data.content?.[0]?.text ?? '[]'
  try {
    const results = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim())
    return { success: true, results }
  } catch {
    return { success: true, results: [] }
  }
}

export async function saveSourcingProfile(formData: FormData) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }
  const supabase = await createClient()

  const keywords = (formData.get('keywords') as string || '').split(',').map(s => s.trim()).filter(Boolean)
  const departments = (formData.get('departments') as string || '').split(',').map(s => s.trim()).filter(Boolean)

  const { error } = await supabase.from('sourcing_profiles').insert({
    company_id: user.company.id,
    name: formData.get('name') as string,
    keywords,
    departments,
    alert_freq: formData.get('alert_freq') as string || 'daily',
  })

  if (error) return { error: error.message }
  revalidatePath('/sourcing')
  return { success: true }
}

export async function createProjectFromSourcing(params: { title: string; buyerName: string; location: string; dlro: string; sourceUrl: string }) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }
  const supabase = await createClient()

  const { data: project, error } = await supabase.from('projects').insert({
    company_id: user.company.id,
    created_by: user.id,
    title: params.title,
    buyer_name: params.buyerName,
    location: params.location,
    dlro: params.dlro || null,
    source_url: params.sourceUrl,
    status: 'sourcing',
  }).select().single()

  if (error) return { error: error.message }

  // Créer le lot par défaut
  await supabase.from('lots').insert({ project_id: project.id, company_id: user.company.id, number: 1, title: 'Marché unique' })

  revalidatePath('/projets')
  return { success: true, projectId: project.id }
}
