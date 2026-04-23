import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { getProjectConversations } from '@/lib/actions/chatbot'
import { ChatbotClient } from '@/components/chatbot/ChatbotClient'

export default async function ChatbotPage({ params }: { params: { id: string } }) {
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

  const conversations = await getProjectConversations(params.id)

  // Vérifier si l'analyse a été faite
  const { data: extractions } = await supabase
    .from('project_extractions')
    .select('lot_id, extraction_status')
    .eq('project_id', params.id)
    .eq('extraction_status', 'done')

  return (
    <ChatbotClient
      project={project}
      lots={project.lots ?? []}
      conversations={conversations}
      hasExtraction={(extractions?.length ?? 0) > 0}
      company={user.company}
    />
  )
}
