import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'

function normalize(m) {
  return {
    id: m.id,
    uuid: m.uuid,
    content: m.content,
    timestamp: m.created_at ? new Date(m.created_at) : null,
    authorUuid: m.author?.uuid,
    authorName: m.author?.name || 'User',
  }
}

function DirectChat({ conversationUuid, partnerName, initialMessages, onBack }) {
  const { user } = useAuth()
  const base = `/direct/${conversationUuid}/message`

  const [messages, setMessages] = useState(() => initialMessages.map(normalize))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [editingUuid, setEditingUuid] = useState('')
  const [editContent, setEditContent] = useState('')

  const historyRef = useRef(null)
  const lastIdRef = useRef(0)

  const mergeMessages = useCallback((incoming) => {
    if (incoming.length === 0) return
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id))
      return [...prev, ...incoming.map(normalize).filter((m) => !ids.has(m.id))]
    })
  }, [])

  useEffect(() => {
    lastIdRef.current = messages.reduce((max, m) => Math.max(max, m.id ?? 0), 0)
  }, [messages])

  useEffect(() => {
    let source
    let cancelled = false

    async function catchUp() {
      const fresh = await apiRequest(`${base}/after/${lastIdRef.current}`)
      if (Array.isArray(fresh)) mergeMessages(fresh)
    }

    async function connect() {
      try {
        const { topic, token } = await apiRequest('/mercure/auth')
        if (cancelled) return

        const url = new URL(import.meta.env.VITE_MERCURE_URL, window.location.origin)
        url.searchParams.append('topic', topic)
        url.searchParams.append('authorization', token)
        source = new EventSource(url)
        
        source.onopen = () => {
          catchUp().catch(() => {})
        }

        source.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.conversation !== conversationUuid) return

          if (data.type === 'created') {
            catchUp().catch(() => {})
          } else if (data.type === 'updated') {
            setMessages((prev) =>
              prev.map((m) => (m.uuid === data.message.uuid ? normalize(data.message) : m)),
            )
          } else if (data.type === 'deleted') {
            setMessages((prev) => prev.filter((m) => m.uuid !== data.uuid))
          }
        }

        source.onerror = () => {
          console.warn('Mercure connection lost, browser will retry')
        }
      } catch (err) {
        console.error('Mercure connect failed', err)
      }
    }

    connect()
    return () => {
      cancelled = true
      source?.close()
    }
  }, [base, conversationUuid, mergeMessages])

  useEffect(() => {
    const el = historyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function handleSend(event) {
    event.preventDefault()
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setError('')
    try {
      const created = await apiRequest(base, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      mergeMessages([created])
      setInput('')
    } catch (requestError) {
      setError(requestError.message || 'Could not send message.')
    } finally {
      setSending(false)
    }
  }

  async function handleUpdate(event) {
    event.preventDefault()
    const content = editContent.trim()
    if (!content) return
    try {
      const updated = await apiRequest(`${base}/${editingUuid}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      })
      setMessages((prev) => prev.map((m) => (m.uuid === editingUuid ? normalize(updated) : m)))
      setEditingUuid('')
    } catch (requestError) {
      setError(requestError.message || 'Could not update message.')
    }
  }

  async function handleDelete(message) {
    try {
      await apiRequest(`${base}/${message.uuid}`, { method: 'DELETE' })
      setMessages((prev) => prev.filter((m) => m.uuid !== message.uuid))
    } catch (requestError) {
      setError(requestError.message || 'Could not delete message.')
    }
  }

  return (
    <div className="chat-content">
      <div className="chat-header">
        <button type="button" onClick={onBack}>← Back</button>
        <h2>{partnerName}</h2>
      </div>

      <div className="chat-history" aria-live="polite" ref={historyRef}>
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span>@</span>
            <h2>{partnerName}</h2>
            <p>This is the start of your conversation.</p>
          </div>
        ) : (
          messages.map((message) => {
            const isAuthor = Boolean(user?.uuid && message.authorUuid === user.uuid)
            return (
              <article className="chat-message" key={message.uuid}>
                <span className="chat-message-avatar">{message.authorName.charAt(0).toUpperCase()}</span>
                <div className="chat-message-body">
                  <div className="chat-message-meta">
                    <strong>{message.authorName}</strong>
                    {message.timestamp && (
                      <time dateTime={message.timestamp.toISOString()}>
                        {message.timestamp.toLocaleString()}
                      </time>
                    )}
                    {isAuthor && (
                      <div className="chat-message-actions">
                        <button
                          type="button"
                          onClick={() => { setEditingUuid(message.uuid); setEditContent(message.content) }}
                        >
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(message)}>Delete</button>
                      </div>
                    )}
                  </div>
                  {editingUuid === message.uuid ? (
                    <form className="chat-message-edit" onSubmit={handleUpdate}>
                      <textarea
                        aria-label="Edit message"
                        value={editContent}
                        maxLength={4000}
                        onChange={(event) => setEditContent(event.target.value)}
                        autoFocus
                      />
                      <div>
                        <button type="button" onClick={() => setEditingUuid('')}>Cancel</button>
                        <button type="submit" disabled={!editContent.trim()}>Save</button>
                      </div>
                    </form>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </article>
            )
          })
        )}
      </div>

      {error && <p className="inline-error" role="alert">{error}</p>}

      <form className="chat-composer" onSubmit={handleSend}>
        <input
          aria-label={`Message ${partnerName}`}
          placeholder={`Message @${partnerName}`}
          value={input}
          maxLength={4000}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" disabled={!input.trim() || sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

export default DirectChat