import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { ParametresClient } from '@/components/parametres/ParametresClient'

export default async function ParametresPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')
  return <ParametresClient company={user.company} user={user} />
}
