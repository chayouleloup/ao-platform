'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  createConversation,
  sendChatMessage,
  getConversationHistory,
} from '@/lib/actions/chatbot'
import { QUICK_QUESTIONS } from '@/lib/services/rag-service'
import type { ChatSource } from '@/lib/services/rag-service'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  isStreaming?: boolean
}

interface Props {
  project: any
  lots: any[]
  conversations: any[]
  hasExtraction: boolean
  company: any
}

export function ChatbotClient({ project, lots, conversations: initialConvs, hasExtraction, company }: Props) {
  const [conversations, setConversations] = useState(initialConvs)
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConvs[0]?.id ?? null)
  const [selectedLotId, setSelectedLotId] = useState(lots[0]?.id ?? '')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isTyping = isPending || isLoading

  // Scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Charger historique d'une conversation
  async function loadConversation(convId: string) {
    setIsLoading(true)
    const history = await getConversationHistory(convId)
    setMessages(history.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      sources: m.sources ?? [],
    })))
    setActiveConvId(convId)
    setIsLoading(false)
  }

  // Nouvelle conversation
  async function handleNewConversation() {
    const result = await createConversation(project.id, selectedLotId)
    if (result?.error) { setError(result.error); return }
    const conv = result.conversation!
    setConversations(prev => [conv, ...prev])
    setActiveConvId(conv.id)
    setMessages([])
  }

  // Envoyer un message
  async function handleSend(messageText?: string) {
    const text = (messageText ?? input).trim()
    if (!text || isTyping) return

    setInput('')
    setError(null)

    // Si pas de conversation active, en créer une
    let convId = activeConvId
    if (!convId) {
      const result = await createConversation(project.id, selectedLotId)
      if (result?.error) { setError(result.error); return }
      convId = result.conversation!.id
      setConversations(prev => [result.conversation!, ...prev])
      setActiveConvId(convId)
    }

    // Afficher le message utilisateur immédiatement
    const userMsg: Message = { role: 'user', content: text }
    const thinkingMsg: Message = { role: 'assistant', content: '', isStreaming: true }
    setMessages(prev => [...prev, userMsg, thinkingMsg])

    // Historique pour l'API (sans le message "thinking")
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    startTransition(async () => {
      const result = await sendChatMessage({
        conversationId: convId!,
        projectId: project.id,
        lotId: selectedLotId,
        userMessage: text,
        history,
      })

      if (result?.error) {
        setMessages(prev => prev.slice(0, -1)) // retirer le message thinking
        setError(result.error)
        return
      }

      // Remplacer le message thinking par la vraie réponse
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          id: result.message!.id,
          role: 'assistant',
          content: result.message!.content,
          sources: result.message!.sources ?? [],
        },
      ])

      // Mettre à jour le titre de la conversation
      if (messages.length === 0) {
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title: text.slice(0, 60) } : c
        ))
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const primaryColor = company.primary_color ?? '#1a56db'

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">

      {/* ─── Sidebar conversations ────────────────────── */}
      <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <Link href={`/projets/${project.id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            {project.title}
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: primaryColor }}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">Assistant AO</span>
          </div>

          {/* Sélection lot */}
          {lots.length > 1 && (
            <select
              value={selectedLotId}
              onChange={e => setSelectedLotId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none mb-2"
            >
              {lots.map((l: any) => (
                <option key={l.id} value={l.id}>Lot {l.number} — {l.title}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleNewConversation}
            className="w-full flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2 rounded-lg transition-all border border-slate-700"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nouvelle conversation
          </button>
        </div>

        {/* Liste conversations */}
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-slate-600 text-center mt-4 px-4">Aucune conversation</p>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-all ${
                  activeConvId === conv.id ? 'bg-slate-800/80 border-r-2 border-blue-500' : ''
                }`}
              >
                <p className="text-xs font-medium text-slate-300 truncate">{conv.title ?? 'Conversation'}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {new Date(conv.updated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Légende */}
        <div className="p-3 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 text-center leading-relaxed">
            Limité au corpus du projet.<br />
            Sources citées à chaque réponse.
          </p>
        </div>
      </div>

      {/* ─── Zone principale ─────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 && (
            <WelcomeScreen
              projectTitle={project.title}
              lotTitle={lots.find((l: any) => l.id === selectedLotId)?.title ?? ''}
              hasExtraction={hasExtraction}
              onQuestionClick={q => handleSend(q)}
              primaryColor={primaryColor}
            />
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={msg.id ?? i} message={msg} primaryColor={primaryColor} />
          ))}

          {/* Indicateur de frappe */}
          {isTyping && messages[messages.length - 1]?.isStreaming && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
                <span className="text-xs text-slate-400">Analyse du corpus en cours...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Erreur */}
        {error && (
          <div className="mx-6 mb-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 flex items-center justify-between">
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-3">✕</button>
          </div>
        )}

        {/* Suggestions rapides (si conversation vide) */}
        {messages.length === 0 && (
          <div className="px-6 pb-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {QUICK_QUESTIONS.slice(0, 4).map(q => (
                <button
                  key={q.label}
                  onClick={() => handleSend(q.query)}
                  disabled={isTyping}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-full transition-all"
                >
                  <span>{q.icon}</span>
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Zone de saisie */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-end gap-3">
            <div className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping}
                placeholder="Posez une question sur ce marché... (Entrée pour envoyer)"
                rows={1}
                className="w-full bg-transparent text-white text-sm px-4 py-3 resize-none focus:outline-none placeholder:text-slate-500 max-h-32"
                style={{ minHeight: '48px' }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 128) + 'px'
                }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="w-11 h-11 flex items-center justify-center rounded-xl text-white disabled:opacity-30 transition-all flex-shrink-0"
              style={{ background: input.trim() && !isTyping ? primaryColor : '#334155' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-slate-600 text-center mt-2">
            Réponses basées uniquement sur le corpus du projet · Sources citées
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────

function MessageBubble({ message, primaryColor }: { message: Message; primaryColor: string }) {
  const isUser = message.role === 'user'
  const [showSources, setShowSources] = useState(false)

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: primaryColor + '30', border: `1px solid ${primaryColor}40` }}>
          <svg className="w-4 h-4" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      )}

      <div className={`max-w-[75%] ${isUser ? 'order-first' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'text-white rounded-tr-sm'
            : 'bg-slate-800 border border-slate-700/50 text-slate-100 rounded-tl-sm'
        }`} style={isUser ? { background: primaryColor } : {}}>
          {message.isStreaming ? (
            <div className="flex items-center gap-2 py-1">
              <div className="flex gap-1">
                {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
            </div>
          ) : (
            <MessageContent content={message.content} />
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowSources(s => !s)}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
              {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
              <svg className={`w-3 h-3 transition-transform ${showSources ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showSources && (
              <div className="mt-1 space-y-1">
                {message.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg px-2.5 py-1.5">
                    <svg className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-[10px] text-slate-400">{s.doc}</span>
                    {s.page && <span className="text-[10px] text-slate-600">· {s.page}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      )}
    </div>
  )
}

// Rendu du contenu markdown simplifié
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />

        // Supprimer les balises [SOURCE: ...] de l'affichage
        const cleanLine = line.replace(/\[SOURCE:[^\]]+\]/g, '').trim()
        if (!cleanLine) return null

        if (line.startsWith('## ')) return <p key={i} className="font-bold text-white mt-2">{cleanLine.slice(3)}</p>
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-white">{cleanLine.slice(2, -2)}</p>
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-slate-500 mt-0.5 flex-shrink-0">•</span>
              <span className="flex-1">{renderInline(cleanLine.slice(2))}</span>
            </div>
          )
        }

        // "Non précisé dans les documents."
        if (line.includes('Non précisé dans les documents.')) {
          return (
            <p key={i} className="text-amber-400/80 italic text-xs bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
              ⚠ Non précisé dans les documents.
            </p>
          )
        }

        return <p key={i}>{renderInline(cleanLine)}</p>
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// ─── WelcomeScreen ────────────────────────────────────────────

function WelcomeScreen({ projectTitle, lotTitle, hasExtraction, onQuestionClick, primaryColor }: {
  projectTitle: string
  lotTitle: string
  hasExtraction: boolean
  onQuestionClick: (q: string) => void
  primaryColor: string
}) {
  return (
    <div className="max-w-2xl mx-auto pt-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: primaryColor + '20', border: `2px solid ${primaryColor}40` }}>
          <svg className="w-7 h-7" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Assistant AO</h2>
        <p className="text-slate-400 text-sm">
          {projectTitle}{lotTitle && ` — ${lotTitle}`}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Répond uniquement à partir du corpus de ce projet
        </p>
      </div>

      {!hasExtraction && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 text-center">
          <p className="text-sm text-amber-400">⚠️ Lancez d'abord l'analyse DCE pour un assistant plus précis.</p>
        </div>
      )}

      {/* Questions suggérées */}
      <div className="grid grid-cols-2 gap-3">
        {QUICK_QUESTIONS.map(q => (
          <button
            key={q.label}
            onClick={() => onQuestionClick(q.query)}
            className="text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl p-4 transition-all group"
          >
            <span className="text-2xl block mb-2">{q.icon}</span>
            <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{q.label}</p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.query}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
