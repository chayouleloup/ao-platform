import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { getResultatsKpis } from '@/lib/actions/resultats'

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const companyId = user.company.id

  const [
    { data: projects },
    { data: expiredDocs },
    { data: sourcing },
    kpis,
  ] = await Promise.all([
    supabase.from('projects').select('id, title, status, dlro, lots(id, progress_analyse, progress_memoire, progress_admin, progress_prix)').eq('company_id', companyId).not('status', 'in', '("abandon")').order('created_at', { ascending: false }).limit(5),
    supabase.from('company_documents').select('id, name').eq('company_id', companyId).eq('status', 'expired'),
    supabase.from('sourcing_profiles').select('id').eq('company_id', companyId).eq('is_active', true),
    getResultatsKpis(),
  ])

  const activeProjects = projects?.filter(p => !['gagne','perdu'].includes(p.status)) ?? []
  const urgentDlro = projects?.filter(p => {
    if (!p.dlro) return false
    const diff = (new Date(p.dlro).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 7
  }) ?? []

  const greetingHour = new Date().getHours()
  const greeting = greetingHour < 12 ? 'Bonjour' : greetingHour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const firstName = user.profile.full_name.split(' ')[0]
  const trialDaysLeft = user.company.trial_ends_at ? Math.ceil((new Date(user.company.trial_ends_at).getTime() - Date.now()) / 86400000) : null

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{greeting}, {firstName} 👋</h1>
        <p className="text-slate-400 mt-1 text-sm">{user.company.name} · Tableau de bord</p>
      </div>

      {user.company.subscription_status === 'trial' && trialDaysLeft !== null && trialDaysLeft >= 0 && (
        <div className="mb-6 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎯</span>
            <div>
              <p className="text-sm font-semibold text-white">Période d'essai — {trialDaysLeft} jour{trialDaysLeft > 1 ? 's' : ''} restant{trialDaysLeft > 1 ? 's' : ''}</p>
              <p className="text-xs text-slate-400">Accès complet à tous les modules</p>
            </div>
          </div>
          <Link href="/parametres" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all">Passer Pro →</Link>
        </div>
      )}

      {((expiredDocs?.length ?? 0) > 0 || urgentDlro.length > 0) && (
        <div className="mb-6 space-y-2">
          {urgentDlro.map(p => {
            const diff = Math.ceil((new Date(p.dlro!).getTime() - Date.now()) / 86400000)
            return (
              <Link key={p.id} href={`/projets/${p.id}`} className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 hover:bg-red-500/15 transition-all">
                <span className="text-red-400 font-bold">⚡</span>
                <p className="text-sm font-medium text-red-300 flex-1">DLRO dans {diff} jour{diff > 1 ? 's' : ''} — {p.title}</p>
                <span className="text-xs text-red-400">→</span>
              </Link>
            )
          })}
          {(expiredDocs?.length ?? 0) > 0 && (
            <Link href="/entreprise/documents" className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 hover:bg-amber-500/15 transition-all">
              <span className="text-amber-400">⚠️</span>
              <p className="text-sm font-medium text-amber-300 flex-1">{expiredDocs!.length} document{expiredDocs!.length > 1 ? 's' : ''} expiré{expiredDocs!.length > 1 ? 's' : ''}</p>
              <span className="text-xs text-amber-400">→</span>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Projets actifs', value: activeProjects.length, icon: '📁', href: '/projets', color: 'text-blue-400' },
          { label: 'DLRO urgentes', value: urgentDlro.length, icon: '⏰', href: '/projets', color: urgentDlro.length > 0 ? 'text-red-400' : 'text-slate-400' },
          { label: 'Taux de succès', value: kpis ? `${kpis.taux}%` : '—', icon: '🏆', href: '/resultats', color: 'text-green-400' },
          { label: 'Alertes AO', value: sourcing?.length ?? 0, icon: '🔔', href: '/sourcing', color: 'text-purple-400' },
        ].map(k => (
          <Link key={k.label} href={k.href} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800 hover:border-slate-600 transition-all group">
            <span className="text-2xl">{k.icon}</span>
            <p className={`text-3xl font-bold mt-2 ${k.color}`}>{k.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white text-sm">Projets récents</h2>
            <Link href="/projets" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Tous →</Link>
          </div>
          {activeProjects.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-slate-500 text-sm mb-3">Aucun projet en cours</p>
              <Link href="/projets/nouveau" className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all">Créer un projet</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activeProjects.slice(0, 4).map(p => {
                const lots = (p as any).lots ?? []
                const progress = lots.length > 0 ? Math.round(lots.reduce((acc: number, l: any) => acc + (l.progress_analyse + l.progress_memoire + l.progress_admin + l.progress_prix) / 4, 0) / lots.length) : 0
                const dlroDiff = p.dlro ? Math.ceil((new Date(p.dlro).getTime() - Date.now()) / 86400000) : null
                return (
                  <Link key={p.id} href={`/projets/${p.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-all group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{p.title}</p>
                      {dlroDiff !== null && <p className={`text-xs mt-0.5 ${dlroDiff <= 7 ? 'text-red-400' : 'text-slate-500'}`}>J-{dlroDiff}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {progress > 0 && (
                        <div className="w-16 bg-slate-700 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${progress >= 80 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
          <h2 className="font-semibold text-white text-sm mb-4">Accès rapides</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '🔎', label: 'Sourcing AO', href: '/sourcing' },
              { icon: '📊', label: 'Résultats', href: '/resultats' },
              { icon: '🏢', label: 'Entreprise', href: '/entreprise' },
              { icon: '👥', label: 'Équipe', href: '/equipe' },
              { icon: '⚙️', label: 'Paramètres', href: '/parametres' },
              { icon: '📋', label: 'Audit', href: '/parametres' },
            ].map(item => (
              <Link key={item.href+item.label} href={item.href} className="flex items-center gap-2 p-3 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-all">
                <span className="text-lg">{item.icon}</span>
                <p className="text-xs font-medium text-white">{item.label}</p>
              </Link>
            ))}
          </div>
          {kpis && kpis.total > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-xs font-medium text-slate-400 mb-2">Taux de succès global</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-700 rounded-full h-2.5">
                  <div className="h-2.5 rounded-full bg-green-500 transition-all" style={{ width: `${kpis.taux}%` }} />
                </div>
                <span className="text-sm font-bold text-green-400">{kpis.taux}%</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{kpis.gagnes} gagné{kpis.gagnes > 1 ? 's' : ''} / {kpis.total} analysé{kpis.total > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
