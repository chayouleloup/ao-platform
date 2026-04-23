import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { getCompanyProfileScore } from '@/lib/actions/entreprise'

export default async function EntreprisePage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const companyId = user.company.id
  const score = await getCompanyProfileScore()

  // Récupérer les stats
  const [
    { count: certifCount },
    { count: staffCount },
    { count: equipCount },
    { count: refCount },
    { data: expiredDocs },
    { data: expiringDocs },
  ] = await Promise.all([
    supabase.from('company_certifications').select('id', { count: 'exact' }).eq('company_id', companyId).eq('is_active', true),
    supabase.from('company_staff').select('id', { count: 'exact' }).eq('company_id', companyId).eq('is_active', true),
    supabase.from('company_equipment').select('id', { count: 'exact' }).eq('company_id', companyId),
    supabase.from('company_references').select('id', { count: 'exact' }).eq('company_id', companyId),
    supabase.from('company_documents').select('id, name').eq('company_id', companyId).eq('status', 'expired'),
    supabase.from('company_documents').select('id, name').eq('company_id', companyId).eq('status', 'expiring_soon'),
  ])

  const sections = [
    {
      title: 'Identité légale',
      href: '/entreprise/identite',
      score: score.identite,
      icon: '🏢',
      summary: user.company.siret ? `SIRET ${user.company.siret}` : 'SIRET non renseigné',
      missing: score.identite < 100 ? 'Complétez les informations légales' : null,
    },
    {
      title: 'Capacités financières',
      href: '/entreprise/identite#finances',
      score: score.capacites_financieres,
      icon: '💰',
      summary: user.company.revenue_n1
        ? `CA N-1 : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(user.company.revenue_n1)}`
        : 'CA non renseigné',
      missing: score.capacites_financieres < 100 ? 'Ajoutez vos chiffres d\'affaires' : null,
    },
    {
      title: 'Certifications',
      href: '/entreprise/capacites#certifs',
      score: score.certifications,
      icon: '🏅',
      summary: `${certifCount ?? 0} certification${(certifCount ?? 0) > 1 ? 's' : ''} active${(certifCount ?? 0) > 1 ? 's' : ''}`,
      missing: (certifCount ?? 0) === 0 ? 'Ajoutez vos certifications (Qualibat, RGE...)' : null,
    },
    {
      title: 'Moyens humains',
      href: '/entreprise/capacites#staff',
      score: score.staff,
      icon: '👷',
      summary: `${staffCount ?? 0} profil${(staffCount ?? 0) > 1 ? 's' : ''} RH`,
      missing: (staffCount ?? 0) === 0 ? 'Ajoutez les fiches de votre équipe' : null,
    },
    {
      title: 'Moyens techniques',
      href: '/entreprise/capacites#equipement',
      score: score.equipement,
      icon: '🚧',
      summary: `${equipCount ?? 0} matériel${(equipCount ?? 0) > 1 ? 's' : ''}`,
      missing: (equipCount ?? 0) === 0 ? 'Listez vos matériels et équipements' : null,
    },
    {
      title: 'Références marchés',
      href: '/entreprise/references',
      score: score.references,
      icon: '📋',
      summary: `${refCount ?? 0} référence${(refCount ?? 0) > 1 ? 's' : ''}`,
      missing: (refCount ?? 0) === 0 ? 'Ajoutez vos références chantiers' : null,
    },
    {
      title: 'Bibliothèque documentaire',
      href: '/entreprise/documents',
      score: score.documents,
      icon: '📂',
      summary: `${(expiredDocs?.length ?? 0)} expiré${(expiredDocs?.length ?? 0) > 1 ? 's' : ''} · ${(expiringDocs?.length ?? 0)} bientôt`,
      missing: (expiredDocs?.length ?? 0) > 0 ? `${expiredDocs!.length} document(s) expiré(s)` : null,
      alert: (expiredDocs?.length ?? 0) > 0,
    },
  ]

  return (
    <div>
      {/* Alertes documents expirés */}
      {((expiredDocs?.length ?? 0) > 0 || (expiringDocs?.length ?? 0) > 0) && (
        <div className="mb-6 space-y-2">
          {(expiredDocs?.length ?? 0) > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">
                  {expiredDocs!.length} document{expiredDocs!.length > 1 ? 's' : ''} expiré{expiredDocs!.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-400/70">
                  {expiredDocs!.slice(0, 3).map(d => d.name).join(', ')}{expiredDocs!.length > 3 ? '...' : ''}
                </p>
              </div>
              <Link href="/entreprise/documents" className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors">
                Mettre à jour →
              </Link>
            </div>
          )}
          {(expiringDocs?.length ?? 0) > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-xl">⏰</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-400">
                  {expiringDocs!.length} document{expiringDocs!.length > 1 ? 's' : ''} bientôt expiré{expiringDocs!.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-amber-400/70">Expirent dans moins de 30 jours</p>
              </div>
              <Link href="/entreprise/documents" className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors">
                Voir →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Grille des sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className={`bg-slate-800/50 border rounded-xl p-5 hover:bg-slate-800 transition-all group ${
              section.alert
                ? 'border-red-500/30 hover:border-red-500/50'
                : 'border-slate-700/50 hover:border-slate-600'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl">{section.icon}</span>
              <span className={`text-sm font-bold ${
                section.score >= 80 ? 'text-green-400' :
                section.score >= 40 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {section.score}%
              </span>
            </div>

            {/* Barre de progression */}
            <div className="w-full bg-slate-700 rounded-full h-1.5 mb-3">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  section.score >= 80 ? 'bg-green-500' :
                  section.score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${section.score}%` }}
              />
            </div>

            <h3 className="font-semibold text-white text-sm mb-1">{section.title}</h3>
            <p className="text-xs text-slate-500">{section.summary}</p>

            {section.missing && (
              <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
                <span>→</span> {section.missing}
              </p>
            )}
          </Link>
        ))}
      </div>

      {/* Interlocuteur AO */}
      <div className="mt-6 bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white text-sm">Interlocuteur dédié AO</h3>
          <Link
            href="/entreprise/identite#contact-ao"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Modifier →
          </Link>
        </div>
        {user.company.ao_contact_name ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-blue-400">
                {user.company.ao_contact_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user.company.ao_contact_name}</p>
              <p className="text-xs text-slate-400">
                {user.company.ao_contact_role && `${user.company.ao_contact_role} · `}
                {user.company.ao_contact_email}
                {user.company.ao_contact_phone && ` · ${user.company.ao_contact_phone}`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-400/80">
            <span className="text-sm">⚠️</span>
            <p className="text-sm">
              Non renseigné — cet interlocuteur est inséré automatiquement dans les mémoires techniques.{' '}
              <Link href="/entreprise/identite#contact-ao" className="underline hover:text-amber-300">
                Ajouter
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
