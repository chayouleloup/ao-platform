'use client'

import { useState, useTransition } from 'react'
import type { AuthUser } from '@/types/database'
import { ROLE_PERMISSIONS } from '@/types/database'

const ROLE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  admin_platform:  { label: 'Admin Plateforme', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', desc: 'Accès total' },
  admin_entreprise:{ label: 'Administrateur',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',     desc: 'Gestion complète de l\'entreprise' },
  utilisateur:     { label: 'Utilisateur',       color: 'text-green-400 bg-green-500/10 border-green-500/20',  desc: 'Création et gestion des projets' },
  relecteur:       { label: 'Relecteur',         color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', desc: 'Lecture + validation mémoire' },
  finance:         { label: 'Finance',           color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',    desc: 'Accès module prix uniquement' },
}

interface Props { members: any[]; invitations: any[]; currentUser: AuthUser }

export function EquipeClient({ members, invitations, currentUser }: Props) {
  const [showInvite, setShowInvite] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('utilisateur')
  const [success, setSuccess] = useState<string | null>(null)

  const canManage = ['admin_entreprise', 'admin_platform'].includes(currentUser.profile.role)

  async function handleInvite() {
    // En production : envoyer un email via Resend/SendGrid avec le token
    // Pour la démo, on crée l'invitation en DB
    const response = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    setSuccess(`Invitation envoyée à ${inviteEmail}`)
    setShowInvite(false)
    setInviteEmail('')
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">👥 Équipe</h1>
          <p className="text-slate-400 text-sm mt-1">Gérez les membres et leurs rôles d'accès.</p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Inviter un membre
          </button>
        )}
      </div>

      {success && <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-sm text-green-400">{success}</div>}

      {/* Rôles disponibles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'admin_platform').map(([role, cfg]) => (
          <div key={role} className={`border rounded-xl p-3 ${cfg.color.split(' ').slice(1).join(' ')}`}>
            <span className={`text-xs font-bold border px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
            <p className="text-xs text-slate-500 mt-2">{cfg.desc}</p>
          </div>
        ))}
      </div>

      {/* Membres actuels */}
      <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Membres ({members.length})</h2>
      <div className="space-y-2 mb-6">
        {members.map(member => {
          const cfg = ROLE_LABELS[member.role] ?? ROLE_LABELS.utilisateur
          const isCurrentUser = member.id === currentUser.id
          const initials = member.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          return (
            <div key={member.id} className="flex items-center gap-4 bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <div className="w-9 h-9 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-slate-300">{initials}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{member.full_name}</p>
                  {isCurrentUser && <span className="text-[10px] bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Vous</span>}
                </div>
                <p className="text-xs text-slate-500">{member.id}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium border px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
                <div className={`w-2 h-2 rounded-full ${member.is_active ? 'bg-green-400' : 'bg-slate-600'}`} title={member.is_active ? 'Actif' : 'Inactif'} />
                {member.last_login_at && (
                  <span className="text-xs text-slate-600">Dernière connexion {new Date(member.last_login_at).toLocaleDateString('fr-FR')}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Invitations en attente */}
      {invitations.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Invitations en attente ({invitations.length})</h2>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center">
                  <span className="text-amber-400">✉</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white">{inv.email}</p>
                  <p className="text-xs text-slate-500">Expire le {new Date(inv.expires_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <span className={`text-xs font-medium border px-2.5 py-1 rounded-full ${ROLE_LABELS[inv.role]?.color ?? ''}`}>
                  {ROLE_LABELS[inv.role]?.label ?? inv.role}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal invitation */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
            <h3 className="font-semibold text-white mb-4">Inviter un membre</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email *</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="collegue@entreprise.fr" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Rôle</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {Object.entries(ROLE_LABELS).filter(([k]) => !['admin_platform'].includes(k)).map(([role, cfg]) => (
                    <option key={role} value={role}>{cfg.label} — {cfg.desc}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowInvite(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2.5 text-sm font-medium transition-all">Annuler</button>
                <button onClick={handleInvite} disabled={!inviteEmail || isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-all">Envoyer l'invitation</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
