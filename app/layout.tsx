import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'AO Platform — Répondre aux appels d\'offres avec l\'IA',
    template: '%s | AO Platform',
  },
  description: 'Plateforme SaaS d\'automatisation de candidatures aux appels d\'offres publics. Génération mémoire technique, analyse DCE, conformité automatique.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.className} bg-slate-900 text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  )
}
