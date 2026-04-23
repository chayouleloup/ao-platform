'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// REGISTER — crée la company + le premier admin
// ============================================================
export async function registerAction(formData: FormData) {
  const supabase = await createClient()

  const companyName = formData.get('company_name') as string
  const siret = formData.get('siret') as string
  const fullName = formData.get('full_name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // 1. Créer la company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ name: companyName, siret: siret || null })
    .select()
    .single()

  if (companyError) {
    return { error: `Erreur création entreprise : ${companyError.message}` }
  }

  // 2. Inscrire l'utilisateur (le trigger créera le profil automatiquement)
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        company_id: company.id,
        role: 'admin_entreprise', // Premier utilisateur = admin
      },
    },
  })

  if (signUpError) {
    // Rollback company si l'auth échoue
    await supabase.from('companies').delete().eq('id', company.id)
    return { error: `Erreur inscription : ${signUpError.message}` }
  }

  return { success: true, message: 'Vérifiez votre email pour confirmer votre compte.' }
}

// ============================================================
// LOGIN
// ============================================================
export async function loginAction(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Email ou mot de passe incorrect.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ============================================================
// LOGOUT
// ============================================================
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}

// ============================================================
// FORGOT PASSWORD
// ============================================================
export async function forgotPasswordAction(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, message: 'Email de réinitialisation envoyé.' }
}
