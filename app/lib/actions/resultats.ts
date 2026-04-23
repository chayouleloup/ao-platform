'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getAuthUser } from '@/lib/supabase/server'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

async function callClaude(system: string, user: string, maxTokens = 2500) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  })
  const data = await res.json()
  return data.content?.find((c: any) => c.type === 'text')?.text ?? ''
}

// ============================================================
// ENREGISTRER UN FICHIER RÉSULTAT
// ============================================================
export async function createResultat(params: { projectId: string; lotId: string; pdfUrl: string; pdfName: string }) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }
  const supabase = await createClient()

  const { data, error } = await supabase.from('resultats').insert({
    project_id: params.projectId,
    lot_id: params.lotId,
    company_id: user.company.id,
    pdf_url: params.pdfUrl,
    pdf_name: params.pdfName,
    extraction_status: 'pending',
  }).select().single()

  if (error) return { error: error.message }
  return { success: true, id: data.id }
}

// ============================================================
// ANALYSER LE PDF DE NOTATION VIA CLAUDE
// ============================================================
export async function analyzeResultatPdf(resultatId: string) {
  const user = await getAuthUser()
  if (!user) return { error: 'Non authentifié' }
  const supabase = await createClient()

  const { data: resultat } = await supabase.from('resultats').select('*, projects(title), lots(title, number)').eq('id', resultatId).eq('company_id', user.company.id).single()
  if (!resultat) return { error: 'Résultat non trouvé' }

  await supabase.from('resultats').update({ extraction_status: 'running' }).eq('id', resultatId)

  // Récupérer le texte du PDF (via extraction)
  let pdfText = ''
  if (resultat.pdf_url) {
    try {
      const response = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 3000,
          system: 'Extrais fidèlement tout le texte de ce document de notation de marché public. Conserve les notes, commentaires et appréciations.',
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'url', url: resultat.pdf_url } },
            { type: 'text', text: 'Extrais tout le contenu de ce document.' }
          ]}],
        }),
      })
      const data = await response.json()
      pdfText = data.content?.find((c: any) => c.type === 'text')?.text ?? ''
    } catch { pdfText = '' }
  }

  if (!pdfText) {
    await supabase.from('resultats').update({ extraction_status: 'error', notes_utilisateur: 'Extraction PDF impossible - saisie manuelle requise' }).eq('id', resultatId)
    return { error: 'Extraction PDF impossible' }
  }

  // Récupérer contexte du mémoire
  const { data: extraction } = await supabase.from('project_extractions').select('criteria').eq('project_id', resultat.project_id).eq('extraction_status', 'done').limit(1).single()
  const criteria = extraction?.criteria?.value ?? []

  // Analyser les notes + recommandations
  const analysisRaw = await callClaude(
    `Tu es expert en marchés publics français. Tu analyses les résultats de notation d'une offre et proposes des recommandations actionnables.
Réponds UNIQUEMENT en JSON valide.`,
    `Document de notation reçu :
${pdfText.slice(0, 6000)}

Critères du marché : ${criteria.map((c: any) => `${c.name} (${c.weight}%)`).join(', ') || 'Non précisés'}

Analyse ce document et retourne ce JSON :
{
  "result_status": "gagne|perdu|infructueux|sans_suite",
  "notification_date": "YYYY-MM-DD ou null",
  "attributaire": "nom du titulaire ou null",
  "note_globale": 75.5,
  "note_max": 100,
  "notes_by_critere": [
    { "critere": "Valeur technique", "note": 42, "note_max": 60, "commentaire": "Méthodologie bien détaillée mais planning insuffisant", "source_page": "p.3" }
  ],
  "points_perdus": [
    { "critere": "Valeur technique", "points": 8, "raison": "Planning trop vague, absence de phasage détaillé", "section_memoire": "Planning / phasage" }
  ],
  "recommandations": [
    { "priorite": 1, "action": "Détailler le planning avec jalons chiffrés", "detail": "Ajouter un diagramme de Gantt avec jalons précis et responsables", "type": "memoire" },
    { "priorite": 2, "action": "Renforcer les références similaires", "detail": "Ajouter des références avec attestations de maître d'ouvrage", "type": "capacite" }
  ]
}`, 2500)

  let analysis: any = {}
  try {
    analysis = JSON.parse(analysisRaw.replace(/```json\n?|```\n?/g, '').trim())
  } catch { analysis = { result_status: 'perdu', note_globale: null } }

  // Générer les améliorations capitalisables
  const ameliorations = (analysis.recommandations ?? []).map((r: any, i: number) => ({
    titre: r.action,
    description: r.detail,
    type: r.type,
    priorite: r.priorite ?? i + 1,
    validated: false,
  }))

  await supabase.from('resultats').update({
    extraction_status: 'done',
    result_status: analysis.result_status,
    notification_date: analysis.notification_date,
    attributaire: analysis.attributaire,
    note_globale: analysis.note_globale,
    note_max: analysis.note_max ?? 100,
    notes_by_critere: analysis.notes_by_critere ?? [],
    points_perdus: analysis.points_perdus ?? [],
    recommandations: analysis.recommandations ?? [],
    ameliorations,
  }).eq('id', resultatId)

  // Mettre à jour le statut du projet
  if (analysis.result_status) {
    await supabase.from('projects').update({ result_status: analysis.result_status, result_date: analysis.notification_date, status: analysis.result_status === 'gagne' ? 'gagne' : 'perdu' }).eq('id', resultat.project_id).eq('company_id', user.company.id)
  }

  await supabase.from('audit_logs').insert({ company_id: user.company.id, user_id: user.id, action: 'analyse_resultat', resource_type: 'resultat', resource_id: resultatId })

  revalidatePath(`/projets/${resultat.project_id}/resultats`)
  return { success: true, analysis }
}

// ============================================================
// LISTER LES RÉSULTATS D'UN PROJET
// ============================================================
export async function getResultats(projectId: string) {
  const user = await getAuthUser()
  if (!user) return []
  const supabase = await createClient()
  const { data } = await supabase.from('resultats').select('*').eq('project_id', projectId).eq('company_id', user.company.id).order('created_at', { ascending: false })
  return data ?? []
}

// ============================================================
// KPIs GLOBAUX RÉSULTATS
// ============================================================
export async function getResultatsKpis() {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()

  const { data: all } = await supabase.from('resultats').select('result_status, note_globale, note_max, notes_by_critere').eq('company_id', user.company.id).eq('extraction_status', 'done')
  if (!all?.length) return { total: 0, gagnes: 0, perdus: 0, taux: 0, note_moyenne: 0, top_pertes: [] }

  const decided = all.filter(r => r.result_status === 'gagne' || r.result_status === 'perdu')
  const gagnes = all.filter(r => r.result_status === 'gagne').length
  const taux = decided.length > 0 ? Math.round((gagnes / decided.length) * 100) : 0
  const noteMoyenne = all.filter(r => r.note_globale).reduce((s, r) => s + (r.note_globale / r.note_max) * 100, 0) / (all.filter(r => r.note_globale).length || 1)

  // Top causes de perte de points
  const pertesByCritere: Record<string, number[]> = {}
  all.forEach(r => {
    (r.notes_by_critere ?? []).forEach((n: any) => {
      if (!pertesByCritere[n.critere]) pertesByCritere[n.critere] = []
      const pct = n.note_max > 0 ? ((n.note_max - n.note) / n.note_max) * 100 : 0
      pertesByCritere[n.critere].push(pct)
    })
  })

  const topPertes = Object.entries(pertesByCritere)
    .map(([critere, vals]) => ({ critere, perte_moy: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }))
    .sort((a, b) => b.perte_moy - a.perte_moy)
    .slice(0, 5)

  return { total: all.length, gagnes, perdus: all.filter(r => r.result_status === 'perdu').length, taux, note_moyenne: Math.round(noteMoyenne), top_pertes: topPertes }
}
