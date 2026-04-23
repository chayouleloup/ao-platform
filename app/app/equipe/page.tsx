import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { EquipeClient } from '@/components/equipe/EquipeClient'

export default async function EquipePage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase.from('profiles').select('*').eq('company_id', user.company.id).order('created_at'),
    supabase.from('invitations').select('*').eq('company_id', user.company.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()),
  ])

  return <EquipeClient members={members ?? []} invitations={invitations ?? []} currentUser={user} />
}
