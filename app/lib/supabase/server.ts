import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { AuthUser } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignoré dans les Server Components (lecture seule)
          }
        },
      },
    }
  )
}

// Récupère l'utilisateur authentifié + son profil + sa company
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) return null

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', profile.company_id)
    .single()

  if (companyError || !company) return null

  return {
    id: user.id,
    email: user.email!,
    profile,
    company,
  }
}
