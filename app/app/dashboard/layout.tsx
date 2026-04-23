import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()

  if (!user) {
    redirect('/auth/login')
  }

  if (!user.profile.is_active) {
    redirect('/auth/login?error=account_disabled')
  }

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
