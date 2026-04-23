import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { getCompanyProfileScore } from '@/lib/actions/entreprise'

const TABS = [
  { label: '📥 Import IA', href: '/entreprise/import' },
  { label: 'Vue d\'ensemble', href: '/entreprise', exact: true },
  { label: 'Identité', href: '/entreprise/identite' },
  { label: 'Capacités', href: '/entreprise/capacites' },
  { label: 'Références', href: '/entreprise/references' },
  { label: 'Documents', href: '/entreprise/documents' },
]

export default async function EntrepriseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const score = await getCompanyProfileScore()

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{user.company.name}</h1>
            <p className="text-slate-400 mt-1 text-sm">
              Gérez les données de votre entreprise — elles alimentent automatiquement vos candidatures AO.
            </p>
          </div>
          {/* Score global */}
          <div className="text-right">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Complétude du profil</p>
                <div className="w-48 bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      score.total >= 80 ? 'bg-green-500' :
                      score.total >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${score.total}%` }}
                  />
                </div>
              </div>
              <span className={`text-2xl font-bold ${
                score.total >= 80 ? 'text-green-400' :
                score.total >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {score.total}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700/50 mb-6 -mx-1 px-1">
        {TABS.map((tab) => (
          <TabLink key={tab.href} {...tab} />
        ))}
      </div>

      {children}
    </div>
  )
}

// Client component pour l'état actif
function TabLink({ label, href, exact }: { label: string; href: string; exact?: boolean }) {
  // On utilise un pattern simple côté serveur
  return (
    <Link
      href={href}
      className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 border-b-2 border-transparent hover:border-slate-500 transition-all whitespace-nowrap"
    >
      {label}
    </Link>
  )
}
