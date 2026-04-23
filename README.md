# AO Platform — Guide de démarrage

Plateforme SaaS d'automatisation de candidatures aux appels d'offres publics.

## Stack technique

- **Frontend** : Next.js 14 (App Router) + TypeScript
- **Backend** : Supabase (PostgreSQL + Auth + Storage + RLS)
- **Styling** : Tailwind CSS
- **IA** : Anthropic Claude API
- **Déploiement** : Vercel

---

## 1. Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → "New project"
2. Choisissez une région EU (Frankfurt recommandé pour RGPD)
3. Notez votre `Project URL` et vos clés API

---

## 2. Configurer la base de données

Dans Supabase → **SQL Editor**, copiez-collez et exécutez :

```
supabase/migrations/001_initial_schema.sql
```

Ce script crée :
- `companies` — les entreprises clientes (multi-tenant)
- `profiles` — les utilisateurs (liés à auth.users)
- `invitations` — pour inviter des collègues
- `audit_logs` — journal d'audit (obligatoire CDC)
- RLS policies — isolation stricte par tenant
- Triggers — profil auto à l'inscription, updated_at

---

## 3. Configurer l'authentification Supabase

Dans Supabase → **Authentication → Settings** :

1. **Site URL** : `http://localhost:3000` (dev) / votre domaine (prod)
2. **Redirect URLs** : ajoutez `http://localhost:3000/auth/callback`
3. **Email confirmation** : activée (recommandé)

---

## 4. Installation locale

```bash
# Cloner / créer le projet Next.js
npx create-next-app@14 ao-platform --typescript --tailwind --app --no-src-dir
cd ao-platform

# Installer les dépendances Supabase
npm install @supabase/supabase-js @supabase/ssr

# Copier les variables d'environnement
cp .env.local.example .env.local
# → Remplissez les valeurs dans .env.local

# Lancer en dev
npm run dev
```

---

## 5. Structure des fichiers clés

```
ao-platform/
├── app/
│   ├── layout.tsx                    # Root layout
│   ├── globals.css
│   ├── auth/
│   │   ├── login/page.tsx            # Page connexion
│   │   ├── register/page.tsx         # Page inscription (crée company + admin)
│   │   └── callback/route.ts         # Callback OAuth/magic link
│   └── dashboard/
│       ├── layout.tsx                # Layout protégé (vérifie auth)
│       └── page.tsx                  # Dashboard principal
├── components/
│   └── dashboard/
│       └── Sidebar.tsx               # Navigation principale
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Client navigateur
│   │   └── server.ts                 # Client serveur + getAuthUser()
│   └── actions/
│       └── auth.ts                   # Server Actions (register/login/logout)
├── types/
│   └── database.ts                   # Types TypeScript + permissions RBAC
├── middleware.ts                      # Protection des routes
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql    # Schéma DB complet
```

---

## 6. Flux d'authentification

```
/auth/register
  → créer company dans DB
  → signUp Supabase Auth (avec metadata: company_id, role, full_name)
  → trigger SQL crée le profil automatiquement
  → email de confirmation
  → /auth/login

/auth/login
  → signInWithPassword
  → middleware détecte la session
  → redirect /dashboard

/dashboard
  → layout.tsx appelle getAuthUser() (user + profile + company)
  → sidebar affiche les infos de l'entreprise
  → page affiche KPIs + onboarding
```

---

## 7. RBAC — Rôles et permissions

| Rôle | Accès |
|------|-------|
| `admin_platform` | Tout (super admin) |
| `admin_entreprise` | Tout dans son enterprise + gestion utilisateurs |
| `utilisateur` | Projets, documents, mémoire, admin |
| `relecteur` | Lecture + validation mémoire uniquement |
| `finance` | Lecture + validation prix uniquement |

---

## 8. Roadmap modules

- [x] **Socle** : Auth, Multi-tenant, RBAC, Dashboard
- [ ] **Module 2** : Espace Entreprise (données structurées + bibliothèque)
- [ ] **Module 3** : Sourcing AO + alertes
- [ ] **Module 4** : Gestion DCE + versioning + classification IA
- [ ] **Module 5** : Analyse DCE (extraction + score confiance)
- [ ] **Module 6** : Moteur de conformité (checklist + blocages)
- [ ] **Module 7** : Génération mémoire technique DOCX
- [ ] **Module 8** : Prix DPGF/BPU/DQE (Excel)
- [ ] **Module 9** : Chatbot RAG contextualisé
- [ ] **Module 10** : Export pack + rapport conformité
- [ ] **Module 11** : Résultats & notation (PDF → IA)
