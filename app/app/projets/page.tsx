import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { ProjetsClient } from '@/components/projets/ProjetsClient'
import type { Project } from '@/types/projet'

export default async function ProjetsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      lots (id, number, title, status, progress_analyse, progress_memoire, progress_admin, progress_prix)
    `)
    .eq('company_id', user.company.id)
    .order('created_at', { ascending: false })

  // Stats rapides
  const stats = {
    total: projects?.length ?? 0,
    en_cours: projects?.filter(p => !['gagne', 'perdu', 'abandon'].includes(p.status)).length ?? 0,
    dlro_urgents: projects?.filter(p => {
      if (!p.dlro) return false
      const diff = (new Date(p.dlro).getTime() - Date.now()) / 86400000
      return diff >= 0 && diff <= 7
    }).length ?? 0,
    gagnes: projects?.filter(p => p.status === 'gagne').length ?? 0,
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Mes projets AO</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {stats.total} projet{stats.total > 1 ? 's' : ''} · {stats.en_cours} en cours
          </p>
        </div>
        <Link
          href="/projets/nouveau"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau projet
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Projets en cours', value: stats.en_cours, icon: '📁', color: 'text-blue-400' },
          { label: 'DLRO ≤ 7 jours', value: stats.dlro_urgents, icon: '⏰', color: stats.dlro_urgents > 0 ? 'text-red-400' : 'text-slate-400' },
          { label: 'Marchés gagnés', value: stats.gagnes, icon: '🏆', color: 'text-green-400' },
          {
            label: 'Taux de succès',
            value: stats.total > 0 ? `${Math.round((stats.gagnes / Math.max(projects?.filter(p => ['gagne','perdu'].includes(p.status)).length ?? 1, 1)) * 100)}%` : '—',
            icon: '📊',
            color: 'text-purple-400'
          },
        ].map(k => (
          <div key={k.label} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <span className="text-xl">{k.icon}</span>
            <p className={`text-2xl font-bold mt-2 ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <ProjetsClient projects={(projects as Project[]) ?? []} />
    </div>
  )
}
