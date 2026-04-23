import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { AdminClient } from '@/components/admin/AdminClient'

const ADMIN_EMAIL = 'admin@lsconsulting.com'

export default async function AdminPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  // Vérifier que c'est bien l'admin
  if (user.email !== ADMIN_EMAIL && user.profile.role !== 'admin_platform') {
    redirect('/dashboard')
  }

  const supabase = await createClient()

  // Récupérer toutes les entreprises avec leurs utilisateurs
  const { data: companies } = await supabase
    .from('companies')
    .select(`
      *,
      profiles (
        id, full_name, role, last_login_at, is_active, created_at
      )
    `)
    .order('created_at', { ascending: false })

  // Stats globales
  const { count: totalProjects } = await supabase
    .from('projects')
    .select('id', { count: 'exact' })

  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' })

  return (
    <AdminClient
      companies={companies ?? []}
      stats={{
        companies: companies?.length ?? 0,
        users: totalUsers ?? 0,
        projects: totalProjects ?? 0,
      }}
    />
  )
}
