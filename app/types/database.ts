export type UserRole = 'admin_platform' | 'admin_entreprise' | 'utilisateur' | 'relecteur' | 'finance'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'paused'
export type SubscriptionPlan = 'starter' | 'pro' | 'enterprise'

export interface Company {
  id: string
  name: string
  siret: string | null
  siren: string | null
  ape_code: string | null
  legal_form: string | null
  tva_number: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  ao_contact_name: string | null
  ao_contact_role: string | null
  ao_contact_email: string | null
  ao_contact_phone: string | null
  revenue_n1: number | null
  revenue_n2: number | null
  revenue_n3: number | null
  stripe_customer_id: string | null
  subscription_status: SubscriptionStatus
  subscription_plan: SubscriptionPlan
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  company_id: string | null
  full_name: string
  role: UserRole
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: string
  company_id: string
  email: string
  role: Exclude<UserRole, 'admin_platform'>
  token: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  company_id: string | null
  user_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  resource_name: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// Auth context enrichi
export interface AuthUser {
  id: string
  email: string
  profile: Profile
  company: Company
}

// Permissions par rôle
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin_platform: ['*'],
  admin_entreprise: [
    'entreprise:read', 'entreprise:write',
    'users:read', 'users:write', 'users:invite',
    'projets:read', 'projets:write',
    'documents:read', 'documents:write',
    'memoire:read', 'memoire:write', 'memoire:validate',
    'prix:read', 'prix:write', 'prix:validate',
    'admin:read', 'admin:write', 'admin:validate',
    'export:read', 'export:write',
    'resultats:read', 'resultats:write',
    'audit:read',
  ],
  utilisateur: [
    'entreprise:read',
    'projets:read', 'projets:write',
    'documents:read', 'documents:write',
    'memoire:read', 'memoire:write',
    'prix:read',
    'admin:read', 'admin:write',
    'export:read',
    'resultats:read',
  ],
  relecteur: [
    'projets:read',
    'documents:read',
    'memoire:read', 'memoire:validate',
    'export:read',
  ],
  finance: [
    'projets:read',
    'documents:read',
    'prix:read', 'prix:write', 'prix:validate',
    'export:read',
  ],
}

export function hasPermission(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role]
  return perms.includes('*') || perms.includes(permission)
}
