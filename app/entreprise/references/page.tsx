import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { ReferencesClient } from '@/components/entreprise/ReferencesClient'

export default async function ReferencesPage() {
  const user = await getAuthUser()
  if (!user) redirect('/auth/login')

  const supabase = await createClient()
  const { data: references } = await supabase
    .from('company_references')
    .select('*')
    .eq('company_id', user.company.id)
    .order('is_featured', { ascending: false })
    .order('end_date', { ascending: false })

  // Totaux
  const totalAmount = references?.reduce((sum, r) => sum + (r.amount ?? 0), 0) ?? 0
  const publicCount = references?.filter(r => r.client_type === 'Public').length ?? 0
  const privateCount = references?.filter(r => r.client_type === 'Privé').length ?? 0

  return (
    <ReferencesClient
      references={references ?? []}
      stats={{ totalAmount, publicCount, privateCount }}
    />
  )
}
