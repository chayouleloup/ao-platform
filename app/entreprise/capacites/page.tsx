import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { CapacitesClient } from '@/components/entreprise/CapacitesClient'

export default async function CapacitesPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const companyId = user.company.id

  const [
    { data: certifications },
    { data: staff },
    { data: equipment },
  ] = await Promise.all([
    supabase.from('company_certifications').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('company_staff').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('company_equipment').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
  ])

  return (
    <CapacitesClient
      certifications={certifications ?? []}
      staff={staff ?? []}
      equipment={equipment ?? []}
    />
  )
}
