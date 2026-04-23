import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { PiecesAdminClient } from '@/components/admin/PiecesAdminClient'

export default async function PiecesAdminPage({ params }: { params: { id: string } }) {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('*, lots(*)').eq('id', params.id).eq('company_id', user.company.id).single()
  if (!project) notFound()

  const { data: pieces } = await supabase.from('pieces_admin').select('*').eq('project_id', params.id).eq('company_id', user.company.id)

  return <PiecesAdminClient project={project} lots={project.lots ?? []} pieces={pieces ?? []} />
}
