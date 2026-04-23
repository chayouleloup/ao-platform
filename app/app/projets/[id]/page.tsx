import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { ProjetDetailClient } from '@/components/projets/ProjetDetailClient'

export default async function ProjetDetailPage({ params }: { params: { id: string } }) {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  // Projet + lots
  const { data: project } = await supabase
    .from('projects')
    .select(`*, lots (*)`)
    .eq('id', params.id)
    .eq('company_id', user.company.id)
    .single()

  if (!project) notFound()

  // Versions DCE
  const { data: versions } = await supabase
    .from('dce_document_versions')
    .select('*')
    .eq('project_id', params.id)
    .order('version', { ascending: false })

  // Documents DCE (dernière version)
  const lastVersion = versions?.[0]
  const { data: documents } = lastVersion
    ? await supabase
        .from('dce_documents')
        .select('*')
        .eq('project_id', params.id)
        .eq('version_id', lastVersion.id)
        .order('doc_type')
    : { data: [] }

  // Extraction (par lot)
  const { data: extractions } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('project_id', params.id)

  return (
    <ProjetDetailClient
      project={project}
      lots={project.lots ?? []}
      versions={versions ?? []}
      documents={documents ?? []}
      extractions={extractions ?? []}
      currentVersionId={lastVersion?.id ?? null}
    />
  )
}
