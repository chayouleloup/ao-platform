import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { AnalyseClient } from '@/components/analyse/AnalyseClient'

export default async function AnalysePage({ params }: { params: { id: string } }) {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  // Projet
  const { data: project } = await supabase
    .from('projects')
    .select('*, lots(*)')
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

  const lastVersion = versions?.[0] ?? null

  // Documents de la dernière version
  const { data: documents } = lastVersion
    ? await supabase
        .from('dce_documents')
        .select('id, file_name, doc_type, scope, classification_confidence, classification_validated, file_url, mime_type, extracted_text, extraction_status')
        .eq('project_id', params.id)
        .eq('version_id', lastVersion.id)
    : { data: [] }

  // Extractions existantes (une par lot)
  const { data: extractions } = await supabase
    .from('project_extractions')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  return (
    <AnalyseClient
      project={project}
      lots={project.lots ?? []}
      versions={versions ?? []}
      documents={documents ?? []}
      extractions={extractions ?? []}
      currentVersionId={lastVersion?.id ?? null}
    />
  )
}
