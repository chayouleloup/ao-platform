'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Project } from '@/types/projet'
import { PROJECT_STATUS_CONFIG, getDlroUrgency } from '@/types/projet'

const ALL_STATUSES = Object.entries(PROJECT_STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))

export function ProjetsClient({ projects }: { projects: Project[] }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('actifs')

  const filtered = projects.filter(p => {
    const matchSearch = search === '' ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.reference?.toLowerCase().includes(search.toLowerCase())

    let matchStatus = true
    if (filterStatus === 'actifs') {
      matchStatus = !['gagne', 'perdu', 'abandon'].includes(p.status)
    } else if (filterStatus !== 'tous') {
      matchStatus = p.status === filterStatus
    }

    return matchSearch && matchStatus
  })

  // Trier par urgence DLRO puis par date de création
  const sorted = [...filtered].sort((a, b) => {
    if (a.dlro && b.dlro) return new Date(a.dlro).getTime() - new Date(b.dlro).getTime()
    if (a.dlro) return -1
    if (b.dlro) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return (
    <div>
      {/* Filtres */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par titre, acheteur, référence..."
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg pl-9 pr-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { value: 'actifs', label: 'En cours' },
            { value: 'tous', label: 'Tous' },
            ...['sourcing', 'analyse', 'redaction', 'depose', 'en_attente', 'gagne', 'perdu'].map(s => ({
              value: s,
              label: PROJECT_STATUS_CONFIG[s as keyof typeof PROJECT_STATUS_CONFIG]?.label ?? s
            }))
          ].slice(0, 6).map(f => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {sorted.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-xl p-16 text-center">
          {projects.length === 0 ? (
            <>
              <p className="text-4xl mb-3">📁</p>
              <p className="text-slate-300 font-medium mb-1">Aucun projet pour l'instant</p>
              <p className="text-slate-500 text-sm mb-4">Créez votre premier projet pour commencer à répondre à des appels d'offres.</p>
              <Link href="/projets/nouveau" className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Créer un projet
              </Link>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Aucun projet ne correspond aux filtres.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const config = PROJECT_STATUS_CONFIG[project.status]
  const urgency = getDlroUrgency(project.dlro)
  const lots = (project as any).lots ?? []

  const globalProgress = lots.length > 0
    ? Math.round(lots.reduce((acc: number, l: any) =>
        acc + (l.progress_analyse + l.progress_memoire + l.progress_admin + l.progress_prix) / 4, 0) / lots.length)
    : 0

  const dlroLabel = project.dlro
    ? (() => {
        const diff = Math.ceil((new Date(project.dlro).getTime() - Date.now()) / 86400000)
        if (diff < 0) return { text: 'DLRO dépassée', urgent: true }
        if (diff === 0) return { text: "Aujourd'hui !", urgent: true }
        if (diff === 1) return { text: 'Demain !', urgent: true }
        if (diff <= 7) return { text: `J-${diff}`, urgent: true }
        return { text: `J-${diff}`, urgent: false }
      })()
    : null

  return (
    <Link
      href={`/projets/${project.id}`}
      className="block bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800 hover:border-slate-600 transition-all group"
    >
      <div className="flex items-start gap-4">
        {/* Statut dot */}
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${config.dot}`} />

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors leading-tight">
                {project.title}
              </h3>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {project.buyer_name && (
                  <span className="text-xs text-slate-400">🏛️ {project.buyer_name}</span>
                )}
                {project.location && (
                  <span className="text-xs text-slate-500">📍 {project.location}</span>
                )}
                {project.reference && (
                  <span className="text-xs text-slate-600">#{project.reference}</span>
                )}
              </div>
            </div>

            {/* DLRO badge */}
            {dlroLabel && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold flex-shrink-0 ${
                dlroLabel.urgent
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
              }`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {dlroLabel.text}
                {project.dlro && (
                  <span className={`ml-1 font-normal ${dlroLabel.urgent ? 'text-red-400/70' : 'text-slate-500'}`}>
                    {new Date(project.dlro).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Infos secondaires */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {/* Statut */}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${config.bg} ${config.color}`}>
              {config.label}
            </span>

            {/* Lots */}
            {lots.length > 1 && (
              <span className="text-xs text-slate-500">
                {lots.length} lots
              </span>
            )}

            {/* Montant */}
            {project.estimated_amount && (
              <span className="text-xs text-slate-500">
                💶 {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(project.estimated_amount)}
              </span>
            )}

            {/* Progression */}
            {globalProgress > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-20 bg-slate-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${globalProgress >= 80 ? 'bg-green-500' : globalProgress >= 40 ? 'bg-blue-500' : 'bg-slate-500'}`}
                    style={{ width: `${globalProgress}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">{globalProgress}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Flèche */}
        <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
