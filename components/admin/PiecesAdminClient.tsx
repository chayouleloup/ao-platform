'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { generatePieceAdmin } from '@/lib/actions/admin-sourcing'

interface Props { project: any; lots: any[]; pieces: any[] }

export function PiecesAdminClient({ project, lots, pieces: initialPieces }: Props) {
  const [pieces, setPieces] = useState(initialPieces)
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [previewPiece, setPreviewPiece] = useState<any>(null)
  const [isPending, startTransition] = useTransition()
  const [generating, setGenerating] = useState<string | null>(null)

  const PIECE_TYPES = [
    { type: 'DC1', label: 'DC1 — Lettre de candidature', icon: '📋', desc: 'Habilitation du mandataire, déclarations sur l\'honneur' },
    { type: 'DC2', label: 'DC2 — Déclaration du candidat', icon: '📄', desc: 'Capacités juridiques, économiques, références' },
    { type: 'AE', label: 'Acte d\'engagement', icon: '✍️', desc: 'Engagement financier, délais, paiement' },
  ]

  async function handleGenerate(pieceType: 'DC1' | 'DC2' | 'AE') {
    setGenerating(pieceType)
    const result = await generatePieceAdmin({ projectId: project.id, lotId: selectedLotId, pieceType })
    setGenerating(null)
    if (result?.success) {
      const existing = pieces.findIndex(p => p.piece_type === pieceType && p.lot_id === selectedLotId)
      if (existing >= 0) {
        setPieces(prev => prev.map((p, i) => i === existing ? { ...p, html_content: result.html } : p))
      } else {
        setPieces(prev => [...prev, { piece_type: pieceType, lot_id: selectedLotId, html_content: result.html, status: 'brouillon' }])
      }
    }
  }

  function downloadHtml(html: string, name: string) {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {project.title}
        </Link>
        <h1 className="text-2xl font-bold text-white">📋 Pièces administratives</h1>
        <p className="text-slate-400 text-sm mt-1">DC1, DC2 et Acte d'engagement préremplis automatiquement depuis vos données entreprise.</p>
      </div>

      {lots.length > 1 && (
        <div className="flex gap-2 mb-6">
          {lots.map((l: any) => (
            <button key={l.id} onClick={() => setSelectedLotId(l.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedLotId === l.id ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 border border-slate-700 hover:text-slate-200'}`}>
              Lot {l.number}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PIECE_TYPES.map(({ type, label, icon, desc }) => {
          const piece = pieces.find(p => p.piece_type === type && p.lot_id === selectedLotId)
          const isGenerated = !!piece?.html_content
          return (
            <div key={type} className={`border rounded-xl p-5 transition-all ${isGenerated ? 'bg-green-500/5 border-green-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}>
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-semibold text-white text-sm mb-1">{label}</h3>
              <p className="text-xs text-slate-500 mb-4">{desc}</p>
              {isGenerated ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-400 text-xs font-medium">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Généré et prérempli
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPreviewPiece(piece)} className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 py-1.5 rounded-lg transition-all">Aperçu</button>
                    <button onClick={() => downloadHtml(piece.html_content, `${type}_Lot${lots.find(l => l.id === selectedLotId)?.number ?? 1}.html`)} className="flex-1 text-xs bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-lg transition-all">⬇ HTML</button>
                  </div>
                  <button onClick={() => handleGenerate(type as any)} disabled={generating === type} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors">
                    ↺ Regénérer
                  </button>
                </div>
              ) : (
                <button onClick={() => handleGenerate(type as any)} disabled={generating === type}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2">
                  {generating === type ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Génération...</>
                  ) : `Générer ${type}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-blue-600/5 border border-blue-500/20 rounded-xl p-4">
        <p className="text-xs text-blue-400">ℹ️ Ces documents sont préremplis depuis vos données entreprise. Les zones en jaune sont à compléter manuellement. Imprimez ou exportez en HTML pour signature.</p>
      </div>

      {/* Preview modal */}
      {previewPiece && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700">
            <h3 className="font-semibold text-white">{previewPiece.piece_type} — Aperçu</h3>
            <button onClick={() => setPreviewPiece(null)} className="text-slate-400 hover:text-slate-200 transition-colors">✕ Fermer</button>
          </div>
          <div className="flex-1 overflow-hidden">
            <iframe srcDoc={previewPiece.html_content} className="w-full h-full border-0 bg-white" />
          </div>
        </div>
      )}
    </div>
  )
}
