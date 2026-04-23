import { notFound, redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { getExportsHistory } from '@/lib/actions/export'
import { ExportClient } from '@/components/export/ExportClient'

export default async function ExportPage({ params }: { params: { id: string } }) {
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
  const exportsHistory = await getExportsHistory(params.id)

  // Résumé de l'état par lot
  const lotStates = await Promise.all(
    lots.map(async (lot: any) => {
      const [
        { count: missingCount },
        { data: memoireData },
        { data: prixData },
      ] = await Promise.all([
        supabase.from('checklist_items')
          .select('id', { count: 'exact' })
          .eq('lot_id', lot.id)
          .eq('company_id', user.company.id)
          .eq('character', 'obligatoire')
          .in('status', ['manquant', 'perime']),
        supabase.from('memoires')
          .select('status')
          .eq('lot_id', lot.id)
          .eq('company_id', user.company.id)
          .limit(1)
          .single(),
        supabase.from('prix_fichiers')
          .select('status, total_ht')
          .eq('lot_id', lot.id)
          .eq('company_id', user.company.id)
          .limit(1)
          .single(),
      ])

      return {
        ...lot,
        missing_count: missingCount ?? 0,
        memoire_status: (memoireData as any)?.status ?? null,
        prix_status: (prixData as any)?.status ?? null,
        prix_total: (prixData as any)?.total_ht ?? null,
      }
    })
  )

  return (
    <ExportClient
      project={project}
      lots={lotStates}
      exportsHistory={exportsHistory}
      company={user.company}
    />
  )
}
