import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { ImportCapacitesClient } from '@/components/entreprise/ImportCapacitesClient'

export default async function ImportCapacitesPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')
  return <ImportCapacitesClient company={user.company} />
}
