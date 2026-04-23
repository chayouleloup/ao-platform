import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { IdentiteForm } from '@/components/entreprise/IdentiteForm'

export default async function IdentitePage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="max-w-2xl space-y-8">
      {/* Identité légale */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Identité légale</h2>
        <IdentiteForm company={user.company} />
      </section>
    </div>
  )
}
