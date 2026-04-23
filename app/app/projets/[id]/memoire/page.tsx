import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateMemoire } from '@/lib/actions/memoire'
import { MemoireClient } from '@/components/memoire/MemoireClient'

export default async function MemoirePage({ params }: { params: { id: string } }) {
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
  const firstLot = lots[0]
  if (!firstLot) notFound()

  // Récupérer ou créer le mémoire du premier lot
  const result = await getOrCreateMemoire(params.id, firstLot.id)

  // Vérifier si extraction existe
  const { data: extractions } = await supabase
    .from('project_extractions')
    .select('lot_id, extraction_status, criteria')
    .eq('project_id', params.id)
    .eq('extraction_status', 'done')

  return (
    <MemoireClient
      project={project}
      lots={lots}
      memoire={(result as any).memoire}
      extractions={extractions ?? []}
      company={user.company}
    />
  )
}
