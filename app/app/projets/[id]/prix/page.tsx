import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { PrixClient } from '@/components/prix/PrixClient'

export default async function PrixPage({ params }: { params: { id: string } }) {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*, lots(*)')
    .eq('id', params.id)
    .eq('company_id', user.company.id)
    .single()

  if (!project) notFound()

  const lots = project.lots ?? []

  // Fichiers prix par lot
  const { data: fichiers } = await supabase
    .from('prix_fichiers')
    .select('*')
    .eq('project_id', params.id)
    .eq('company_id', user.company.id)
    .order('created_at', { ascending: false })

  // Biblio prix client
  const { data: prixClient } = await supabase
    .from('prix_client')
    .select('*')
    .eq('company_id', user.company.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <PrixClient
      project={project}
      lots={lots}
      fichiers={fichiers ?? []}
      prixClient={prixClient ?? []}
    />
  )
}
