import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { getResultatsKpis } from '@/lib/actions/resultats'
import { ResultatsClient } from '@/components/resultats/ResultatsClient'

export default async function ResultatsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()

  const { data: resultats } = await supabase
    .from('resultats')
    .select('*, projects(title, buyer_name), lots(number, title)')
    .eq('company_id', user.company.id)
    .order('created_at', { ascending: false })

  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, lots(id, number, title)')
    .eq('company_id', user.company.id)
    .in('status', ['depose', 'en_attente', 'gagne', 'perdu'])
    .order('created_at', { ascending: false })

  const kpis = await getResultatsKpis()

  return <ResultatsClient resultats={resultats ?? []} projects={projects ?? []} kpis={kpis} />
}
