import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { ConformiteClient } from '@/components/conformite/ConformiteClient'

export default async function ConformitePage({ params }: { params: { id: string } }) {
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

  // Items de checklist pour tous les lots
  const { data: allItems } = await supabase
    .from('checklist_items')
    .select('*, checklist_uploads(*)')
    .eq('project_id', params.id)
    .eq('company_id', user.company.id)
    .order('display_order')

  // Extractions pour savoir si l'analyse a été faite
  const { data: extractions } = await supabase
    .from('project_extractions')
    .select('lot_id, extraction_status, extracted_at')
    .eq('project_id', params.id)
    .eq('extraction_status', 'done')

  return (
    <ConformiteClient
      project={project}
      lots={project.lots ?? []}
      allItems={allItems ?? []}
      extractions={extractions ?? []}
    />
  )
}
