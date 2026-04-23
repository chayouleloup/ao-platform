import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { DocumentsClient } from '@/components/entreprise/DocumentsClient'

export default async function DocumentsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: documents } = await supabase
    .from('company_documents')
    .select('*')
    .eq('company_id', user.company.id)
    .order('status') // expired first
    .order('created_at', { ascending: false })

  const counts = {
    valid: documents?.filter(d => d.status === 'valid').length ?? 0,
    expiring: documents?.filter(d => d.status === 'expiring_soon').length ?? 0,
    expired: documents?.filter(d => d.status === 'expired').length ?? 0,
  }

  return <DocumentsClient documents={documents ?? []} counts={counts} companyId={user.company.id} />
}
