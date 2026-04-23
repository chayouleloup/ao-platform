'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { extractCapacitesFromPdf, applyCapacitesExtraction } from '@/lib/actions/import-capacites'
import type { ExtractionCapacites } from '@/lib/actions/import-capacites'

interface Props { company: any }

type Step = 'upload' | 'extracting' | 'review' | 'applying' | 'done'

const FIELD_LABELS: Record<string, string> = {
  name: 'Raison sociale',
  siret: 'SIRET',
  siren: 'SIREN',
  legal_form: 'Forme juridique',
  ape_code: 'Code APE',
  tva_number: 'N° TVA',
  address: 'Adresse',
  city: 'Ville',
  postal_code: 'Code postal',
  ao_contact_name: 'Interlocuteur AO',
  ao_contact_role: 'Fonction interlocuteur',
  ao_contact_email: 'Email interlocuteur',
  ao_contact_phone: 'Téléphone interlocuteur',
  revenue_n1: 'Chiffre d\'affaires N-1',
  revenue_n2: 'Chiffre d\'affaires N-2',
  revenue_n3: 'Chiffre d\'affaires N-3',
  certifications: 'Certifications',
  staff: 'Moyens humains',
  equipment: 'Moyens techniques',
  references: 'Références chantiers',
}

export function ImportCapacitesClient({ company }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [extracted, setExtracted] = useState<ExtractionCapacites | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([])
  const [chatLoading, setChatLoading] = useState(false)

  async function handleFileUpload(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Veuillez importer un fichier PDF')
      return
    }

    setFileName(file.name)
    setStep('extracting')
    setError(null)

    // Upload vers Supabase Storage
    const supabase = createClient()
    const path = `${company.id}/capacites/${Date.now()}_${file.name}`

    const { error: uploadError } = await supabase.storage
      .from('company-documents')
      .upload(path, file)

    if (uploadError) {
      // Si le bucket n'existe pas, on essaie quand même avec une URL temporaire
      setError('Erreur upload : ' + uploadError.message + '. Assurez-vous que le bucket "company-documents" existe dans Supabase Storage.')
      setStep('upload')
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('company-documents')
      .getPublicUrl(path)

    // Extraction IA
    const result = await extractCapacitesFromPdf(publicUrl)

    if (!result.success || !result.data) {
      setError(result.error ?? 'Erreur lors de l\'extraction')
      setStep('upload')
      return
    }

    setExtracted(result.data)
    setStep('review')

    // Message chatbot pour les champs manquants
    if (result.data.missing_fields?.length) {
      setChatMessages([{
        role: 'ai',
        text: `J'ai analysé votre dossier de capacités et rempli automatiquement ${countExtracted(result.data)} informations. ⚠️ Il manque encore des informations importantes :\n\n${result.data.missing_fields.map(f => `• ${f}`).join('\n')}\n\nVoulez-vous que je vous aide à compléter ces informations ?`,
      }])
    } else {
      setChatMessages([{
        role: 'ai',
        text: `✅ Excellent ! J'ai extrait toutes les informations de votre dossier de capacités. Vérifiez les données ci-dessous avant de les appliquer.`,
      }])
    }
  }

  function countExtracted(data: ExtractionCapacites): number {
    let count = 0
    const simpleFields = ['name','siret','address','city','ao_contact_name','revenue_n1','revenue_n2','revenue_n3']
    simpleFields.forEach(f => { if ((data as any)[f]) count++ })
    if (data.certifications?.length) count += data.certifications.length
    if (data.staff?.length) count += data.staff.length
    if (data.equipment?.length) count += data.equipment.length
    if (data.references?.length) count += data.references.length
    return count
  }

  async function handleApply() {
    if (!extracted) return
    setStep('applying')
    const result = await applyCapacitesExtraction(extracted)
    if (result.success) {
      setStep('done')
    } else {
      setError(result.error ?? 'Erreur')
      setStep('review')
    }
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setChatLoading(true)

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_KEY ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: `Tu aides l'entreprise "${company.name}" à compléter son profil pour les marchés publics. 
Champs manquants : ${extracted?.missing_fields?.join(', ') ?? 'aucun'}.
Réponds de façon concise et pratique. Tu peux demander les informations manquantes et expliquer pourquoi elles sont importantes.`,
          messages: [
            ...chatMessages.map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
            { role: 'user', content: userMsg }
          ],
        }),
      })
      const data = await response.json()
      const text = data.content?.[0]?.text ?? 'Désolé, une erreur est survenue.'
      setChatMessages(prev => [...prev, { role: 'ai', text }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Erreur de connexion. Réessayez.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const fmtEur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/entreprise" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Mon entreprise
        </Link>
        <h1 className="text-2xl font-bold text-white">📄 Import dossier de capacités</h1>
        <p className="text-slate-400 text-sm mt-1">
          Importez votre dossier PDF — l'IA remplit automatiquement toutes les informations de votre entreprise.
        </p>
      </div>

      {/* ÉTAPE : UPLOAD */}
      {step === 'upload' && (
        <div className="max-w-xl">
          <div
            className="border-2 border-dashed border-slate-600 hover:border-blue-500/50 rounded-2xl p-12 text-center cursor-pointer transition-all"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f) }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
            />
            <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-white font-semibold text-lg mb-1">Glissez votre dossier de capacités</p>
            <p className="text-slate-400 text-sm mb-2">ou cliquez pour sélectionner</p>
            <p className="text-slate-600 text-xs">Format PDF uniquement</p>
          </div>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="mt-6 bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">L'IA va extraire automatiquement :</p>
            <div className="grid grid-cols-2 gap-2">
              {['Identité légale (SIRET, forme...)', 'Chiffres d\'affaires N-1/N-2/N-3', 'Certifications (Qualibat, RGE...)', 'Moyens humains et qualifications', 'Matériels et équipements', 'Références de chantiers'].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="text-green-400">✓</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ÉTAPE : EXTRACTION EN COURS */}
      {step === 'extracting' && (
        <div className="max-w-xl text-center py-16">
          <div className="w-20 h-20 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-6" />
          <h2 className="text-xl font-bold text-white mb-2">Analyse en cours...</h2>
          <p className="text-slate-400 text-sm mb-1">L'IA lit votre dossier : <span className="text-white">{fileName}</span></p>
          <div className="mt-6 space-y-2 text-left max-w-xs mx-auto">
            {['Lecture du document PDF', 'Extraction des données entreprise', 'Identification des certifications', 'Détection des références', 'Identification des champs manquants'].map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
                <svg className="animate-spin w-3 h-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ÉTAPE : REVIEW */}
      {step === 'review' && extracted && (
        <div className="grid grid-cols-2 gap-6">

          {/* COLONNE GAUCHE — Données extraites */}
          <div className="space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <span className="text-green-400">✓</span>
              Informations extraites — vérifiez avant d'appliquer
            </h2>

            {/* Identité */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Identité</h3>
              {[
                { label: 'Raison sociale', value: extracted.name },
                { label: 'SIRET', value: extracted.siret },
                { label: 'Forme juridique', value: extracted.legal_form },
                { label: 'Code APE', value: extracted.ape_code },
                { label: 'Adresse', value: [extracted.address, extracted.postal_code, extracted.city].filter(Boolean).join(', ') || null },
              ].map(f => f.value && (
                <div key={f.label} className="flex justify-between items-start gap-2">
                  <span className="text-xs text-slate-500 flex-shrink-0">{f.label}</span>
                  <span className="text-xs text-white text-right">{f.value}</span>
                </div>
              ))}
            </div>

            {/* Interlocuteur AO */}
            {(extracted.ao_contact_name || extracted.ao_contact_email) && (
              <div className="bg-blue-600/5 border border-blue-500/20 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-3">Interlocuteur AO</h3>
                {[
                  { label: 'Nom', value: extracted.ao_contact_name },
                  { label: 'Rôle', value: extracted.ao_contact_role },
                  { label: 'Email', value: extracted.ao_contact_email },
                  { label: 'Téléphone', value: extracted.ao_contact_phone },
                ].map(f => f.value && (
                  <div key={f.label} className="flex justify-between gap-2">
                    <span className="text-xs text-slate-500">{f.label}</span>
                    <span className="text-xs text-white">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CA */}
            {(extracted.revenue_n1 || extracted.revenue_n2 || extracted.revenue_n3) && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Chiffres d'affaires</h3>
                {[
                  { label: 'CA N-1', value: extracted.revenue_n1 },
                  { label: 'CA N-2', value: extracted.revenue_n2 },
                  { label: 'CA N-3', value: extracted.revenue_n3 },
                ].map(f => f.value && (
                  <div key={f.label} className="flex justify-between gap-2">
                    <span className="text-xs text-slate-500">{f.label}</span>
                    <span className="text-xs text-green-400 font-medium">{fmtEur(f.value)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Certifications */}
            {extracted.certifications && extracted.certifications.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Certifications ({extracted.certifications.length})
                </h3>
                <div className="space-y-1.5">
                  {extracted.certifications.map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-white">{c.name}</span>
                      {c.expires_at && <span className="text-[10px] text-slate-500">{c.expires_at}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff */}
            {extracted.staff && extracted.staff.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Moyens humains ({extracted.staff.length})
                </h3>
                <div className="space-y-1.5">
                  {extracted.staff.slice(0, 5).map((s, i) => (
                    <div key={i} className="text-xs text-white">
                      {s.full_name}{s.job_title ? ` — ${s.job_title}` : ''}
                    </div>
                  ))}
                  {extracted.staff.length > 5 && <p className="text-xs text-slate-500">+{extracted.staff.length - 5} autres</p>}
                </div>
              </div>
            )}

            {/* Références */}
            {extracted.references && extracted.references.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Références ({extracted.references.length})
                </h3>
                <div className="space-y-2">
                  {extracted.references.slice(0, 4).map((r, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium text-white">{r.client_name}</p>
                      <p className="text-[10px] text-slate-500">{r.project_name}{r.location ? ` · ${r.location}` : ''}{r.amount ? ` · ${fmtEur(r.amount)}` : ''}</p>
                    </div>
                  ))}
                  {extracted.references.length > 4 && <p className="text-xs text-slate-500">+{extracted.references.length - 4} autres</p>}
                </div>
              </div>
            )}

            {/* Bouton appliquer */}
            <button
              onClick={handleApply}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Appliquer toutes ces informations
            </button>

            <button
              onClick={() => { setStep('upload'); setExtracted(null); setError(null) }}
              className="w-full border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-sm font-medium py-2 rounded-xl transition-all"
            >
              ↺ Importer un autre document
            </button>
          </div>

          {/* COLONNE DROITE — Chatbot manquants */}
          <div className="flex flex-col bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Assistant</p>
                <p className="text-[10px] text-slate-500">Aide à compléter les informations manquantes</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: '300px', maxHeight: '500px' }}>
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-slate-700/50 border border-slate-600/50 text-slate-200 rounded-tl-sm'
                  }`}>
                    {msg.text.split('\n').map((line, j) => (
                      <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 flex items-center gap-2">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-700/50 flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                placeholder="Posez une question..."
                className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatLoading}
                className="w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-lg flex items-center justify-center transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÉTAPE : APPLICATION */}
      {step === 'applying' && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full border-4 border-green-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-white font-medium">Application des données en cours...</p>
        </div>
      )}

      {/* ÉTAPE : DONE */}
      {step === 'done' && (
        <div className="max-w-md text-center py-16 mx-auto">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Profil rempli automatiquement !</h2>
          <p className="text-slate-400 text-sm mb-8">
            Toutes les informations extraites ont été appliquées à votre profil entreprise.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/entreprise"
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-3 rounded-xl transition-all"
            >
              Voir mon profil entreprise →
            </Link>
            <button
              onClick={() => { setStep('upload'); setExtracted(null); setChatMessages([]) }}
              className="border border-slate-600 hover:border-slate-500 text-slate-300 px-5 py-3 rounded-xl transition-all text-sm"
            >
              Importer un autre document
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
