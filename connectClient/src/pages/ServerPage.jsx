import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiPost, apiRequest } from '../api/client.js'
import { serverName, unwrapServer } from '../api/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'
import './ServerPage.css'

function collection(data, key) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[key])) return data[key]
  if (Array.isArray(data?.data?.[key])) return data.data[key]
  if (Array.isArray(data?.data)) return data.data
  return []
}

function normalizeMessage(message) {
  const value = message?.message || message?.data?.message || message?.data || message || {}
  const author = value.author || {}
  const timestampValue = value.timestamp || value.created_at || value.createdAt
  const parsedTimestamp = timestampValue ? new Date(timestampValue) : null
  return {
    id: value.id,
    uuid: value.uuid || value.message_uuid,
    content: value.content || '',
    authorName: value.author_name || value.authorName || author.display_name || author.name || 'User',
    authorUuid: value.author_uuid || author.uuid,
    timestamp: parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime()) ? parsedTimestamp : null,
  }
}

function messageNumericId(message) {
  const id = Number(message.id)
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

function mergeMessages(current, incoming) {
  const existingIds = new Set(current.map(messageNumericId).filter(Boolean))
  const existingUuids = new Set(current.map((message) => message.uuid).filter(Boolean))
  return [
    ...current,
    ...incoming.filter((message) => {
      const id = messageNumericId(message)
      if ((id && existingIds.has(id)) || (message.uuid && existingUuids.has(message.uuid))) return false
      if (id) existingIds.add(id)
      if (message.uuid) existingUuids.add(message.uuid)
      return true
    }),
  ]
}

function ServerPage() {
  const { uuid, channelId } = useParams()
  const navigate = useNavigate()
  const { user, refreshServers } = useAuth()
  const [server, setServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [showChannelTypes, setShowChannelTypes] = useState(false)
  const [newChannelType, setNewChannelType] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [editingChannel, setEditingChannel] = useState(null)
  const [editChannelName, setEditChannelName] = useState('')
  const [editChannelType, setEditChannelType] = useState('text')
  const [messages, setMessages] = useState([])
  const [pollError, setPollError] = useState('')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [editingMessageUuid, setEditingMessageUuid] = useState('')
  const [editMessageContent, setEditMessageContent] = useState('')
  const [savingMessageEdit, setSavingMessageEdit] = useState(false)
  const newestMessageId = useRef(0)

  const loadServer = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [serverData, channelData, memberData] = await Promise.all([
        apiRequest(`/servers/${uuid}`),
        apiRequest(`/servers/${uuid}/channels`),
        apiRequest(`/servers/${uuid}/members`),
      ])
      setServer(unwrapServer(serverData))
      setChannels(collection(channelData, 'channels'))
      setMembers(collection(memberData, 'members'))
    } catch (loadError) {
      setError(loadError.message || 'Could not load this server.')
    } finally {
      setLoading(false)
    }
  }, [uuid])

  useEffect(() => {
    loadServer()
  }, [loadServer])

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null)
      setShowChannelTypes(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeContextMenu()
        setNewChannelType('')
        setEditingChannel(null)
        setEditingMessageUuid('')
      }
    }
    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const membership = members.find((member) =>
    member.user_uuid === user?.uuid || member.user?.uuid === user?.uuid,
  )
  const canManageChannels = ['owner', 'editor'].includes(membership?.role)
  const isOwner = membership?.role === 'owner'
  const activeChannel = channels.find((channel) =>
    String(channel.uuid || channel.channel_uuid || channel.id) === channelId,
  )
  const activeChannelUuid = activeChannel?.uuid || activeChannel?.channel_uuid
  const settings = server?.settings || server || {}

  const channelGroups = useMemo(() => ({
    text: channels.filter((channel) => channel.type === 'text'),
    voice: channels.filter((channel) => channel.type === 'voice'),
  }), [channels])

  useEffect(() => {
    if (!activeChannel || activeChannel.type !== 'text') {
      setMessages([])
      setHistoryLoaded(false)
      newestMessageId.current = 0
      setHasOlderMessages(false)
      setMessagesError('')
      setPollError('')
      setEditingMessageUuid('')
      return undefined
    }

    if (!activeChannelUuid) {
      setMessages([])
      setHistoryLoaded(false)
      newestMessageId.current = 0
      setHasOlderMessages(false)
      setMessagesError('This channel response does not include a channel UUID, so its messages cannot be loaded.')
      return undefined
    }

    const controller = new AbortController()
    setMessages([])
    setHistoryLoaded(false)
    newestMessageId.current = 0
    setMessagesLoading(true)
    setHasOlderMessages(false)
    setMessagesError('')
    setPollError('')
    setEditingMessageUuid('')
    apiRequest(`/channels/${encodeURIComponent(activeChannelUuid)}/messages?limit=50`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return
        const loaded = collection(data, 'messages').map(normalizeMessage)
        setMessages(loaded)
        newestMessageId.current = loaded.reduce(
          (newestId, message) => Math.max(newestId, messageNumericId(message)),
          0,
        )
        setHistoryLoaded(true)
        setHasOlderMessages(Boolean(data?.has_more || data?.hasMore || data?.next_before) || loaded.length === 50)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setMessagesError(loadError.message || 'Could not load channel messages.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMessagesLoading(false)
      })

    return () => controller.abort()
  }, [activeChannel, activeChannelUuid])

  useEffect(() => {
    if (!activeChannelUuid || !historyLoaded || activeChannel?.type !== 'text') return undefined

    const controller = new AbortController()
    let polling = false
    const pollMessages = async () => {
      if (polling) return
      polling = true
      try {
        const data = await apiRequest(
          `/channels/${encodeURIComponent(activeChannelUuid)}/messages/after/${newestMessageId.current}`,
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        const received = collection(data, 'messages').map(normalizeMessage)
        if (received.length) {
          newestMessageId.current = received.reduce(
            (newestId, message) => Math.max(newestId, messageNumericId(message)),
            newestMessageId.current,
          )
          setMessages((current) => mergeMessages(current, received))
        }
        setPollError('')
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setPollError(loadError.message || 'Could not check for new messages.')
        }
      } finally {
        polling = false
      }
    }

    const interval = window.setInterval(pollMessages, 3000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [activeChannel, activeChannelUuid, historyLoaded])

  function openChannelMenu(event) {
    if (!canManageChannels) return
    event.preventDefault()
    setShowChannelTypes(false)
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 230),
      y: Math.min(event.clientY, window.innerHeight - 100),
    })
  }

  function beginCreateChannel(type) {
    setContextMenu(null)
    setShowChannelTypes(false)
    setNewChannelType(type)
    setNewChannelName('')
    setError('')
  }

  function beginEditChannel(channel) {
    setContextMenu(null)
    setEditingChannel(channel)
    setEditChannelName(channel.name || '')
    setEditChannelType(channel.type === 'voice' ? 'voice' : 'text')
    setError('')
  }

  function channelPath(channel) {
    const channelUuid = channel.uuid || channel.channel_uuid
    if (channelUuid) return `/channels/${encodeURIComponent(channelUuid)}`
    return `/servers/${encodeURIComponent(uuid)}/channels/${encodeURIComponent(channel.id)}`
  }

  async function handleCreateChannel(event) {
    event.preventDefault()
    if (!newChannelType) return
    setSaving(true)
    setError('')
    try {
      const result = await apiPost(`/servers/${uuid}/channels`, {
        name: newChannelName.trim(),
        type: newChannelType,
      })
      await loadServer()
      setNewChannelType('')
      const createdChannel = result?.channel || result
      const createdChannelId = createdChannel?.uuid || createdChannel?.channel_uuid || createdChannel?.id
      if (createdChannelId) {
        navigate(`/servers/${uuid}/channels/${createdChannelId}`)
      }
    } catch (requestError) {
      setError(requestError.message || 'Could not create the channel.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateChannel(event) {
    event.preventDefault()
    if (!editingChannel) return
    setSaving(true)
    setError('')
    try {
      await apiRequest(channelPath(editingChannel), {
        method: 'PATCH',
        body: JSON.stringify({
          name: editChannelName.trim(),
          type: editChannelType,
        }),
      })
      const channelIdToUpdate = editingChannel.uuid || editingChannel.channel_uuid || editingChannel.id
      setChannels((current) => current.map((channel) => (
        String(channel.uuid || channel.channel_uuid || channel.id) === String(channelIdToUpdate)
          ? { ...channel, name: editChannelName.trim(), type: editChannelType }
          : channel
      )))
      setEditingChannel(null)
    } catch (requestError) {
      setError(requestError.message || 'Could not update the channel.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteChannel(channel) {
    if (saving || !window.confirm(`Delete channel "${channel.name}"? This cannot be undone.`)) return
    setSaving(true)
    setError('')
    try {
      await apiRequest(channelPath(channel), { method: 'DELETE' })
      const deletedId = String(channel.uuid || channel.channel_uuid || channel.id)
      setChannels((current) => current.filter(
        (item) => String(item.uuid || item.channel_uuid || item.id) !== deletedId,
      ))
      if (String(channelId) === deletedId) navigate(`/servers/${uuid}`)
    } catch (requestError) {
      setError(requestError.message || 'Could not delete the channel.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLoadOlderMessages() {
    const oldestMessageUuid = messages[0]?.uuid
    if (!activeChannelUuid || !oldestMessageUuid || loadingOlder) return
    setLoadingOlder(true)
    setMessagesError('')
    try {
      const data = await apiRequest(
        `/channels/${encodeURIComponent(activeChannelUuid)}/messages?limit=50&before=${encodeURIComponent(oldestMessageUuid)}`,
      )
      const olderMessages = collection(data, 'messages').map(normalizeMessage)
      setMessages((current) => {
        const existingUuids = new Set(current.map((message) => message.uuid).filter(Boolean))
        return [
          ...olderMessages.filter((message) => !message.uuid || !existingUuids.has(message.uuid)),
          ...current,
        ]
      })
      setHasOlderMessages(Boolean(data?.has_more || data?.hasMore || data?.next_before) || olderMessages.length === 50)
    } catch (loadError) {
      setMessagesError(loadError.message || 'Could not load older messages.')
    } finally {
      setLoadingOlder(false)
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault()
    const content = messageInput.trim()
    if (!content || !activeChannelUuid || sendingMessage) return
    setSendingMessage(true)
    setMessagesError('')
    try {
      const result = await apiPost(
        `/channels/${encodeURIComponent(activeChannelUuid)}/messages`,
        { content },
      )
      const createdMessage = normalizeMessage(result)
      newestMessageId.current = Math.max(newestMessageId.current, messageNumericId(createdMessage))
      setMessages((current) => {
        if (createdMessage.uuid && current.some((message) => message.uuid === createdMessage.uuid)) return current
        return [...current, createdMessage]
      })
      setMessageInput('')
    } catch (sendError) {
      setMessagesError(sendError.message || 'Could not send your message.')
    } finally {
      setSendingMessage(false)
    }
  }

  function beginEditMessage(message) {
    setEditingMessageUuid(message.uuid)
    setEditMessageContent(message.content)
    setMessagesError('')
  }

  async function handleUpdateMessage(event) {
    event.preventDefault()
    const content = editMessageContent.trim()
    if (!editingMessageUuid || !content || savingMessageEdit) return
    setSavingMessageEdit(true)
    setMessagesError('')
    try {
      const result = await apiRequest(
        `/channels/${encodeURIComponent(activeChannelUuid)}/messages/${encodeURIComponent(editingMessageUuid)}`,
        { method: 'PATCH', body: JSON.stringify({ content }) },
      )
      const returnedMessage = result?.message || result?.data?.message || result?.data
      const savedContent = typeof returnedMessage?.content === 'string' ? returnedMessage.content : content
      setMessages((current) => current.map((message) => (
        message.uuid === editingMessageUuid ? { ...message, content: savedContent } : message
      )))
      setEditingMessageUuid('')
      setEditMessageContent('')
    } catch (requestError) {
      setMessagesError(requestError.message || 'Could not edit your message.')
    } finally {
      setSavingMessageEdit(false)
    }
  }

  async function handleDeleteMessage(message) {
    if (!message.uuid || !window.confirm('Delete this message? This cannot be undone.')) return
    setMessagesError('')
    try {
      await apiRequest(
        `/channels/${encodeURIComponent(activeChannelUuid)}/messages/${encodeURIComponent(message.uuid)}`,
        { method: 'DELETE' },
      )
      setMessages((current) => current.filter((item) => item.uuid !== message.uuid))
    } catch (requestError) {
      setMessagesError(requestError.message || 'Could not delete your message.')
    }
  }

  if (loading) return <section className="server-page"><p className="server-loading">Loading server…</p></section>
  if (error && !server) {
    return (
      <section className="server-page">
        <p className="server-error" role="alert">{error}</p>
        <Link className="server-back-link" to="/">Back to your servers</Link>
      </section>
    )
  }
  if (!server) return null

  return (
    <section className="server-workspace">
      <aside
        className="server-channel-sidebar"
        aria-label="Server channels"
        onContextMenu={openChannelMenu}
      >
        <div className="server-sidebar-header">
          {isOwner ? (
            <Link className="server-name-button" to={`/servers/${uuid}/settings`}>
              <span>{serverName(server)}</span><span aria-hidden="true">⌄</span>
            </Link>
          ) : (
            <div className="server-name-display">{serverName(server)}</div>
          )}
        </div>

        <div className="server-channel-scroll">
          {['text', 'voice'].map((type) => (
            <section className="server-channel-group" key={type}>
              <h2>{type === 'text' ? 'TEXT CHANNELS' : 'VOICE CHANNELS'}</h2>
              {channelGroups[type].map((channel) => {
                const id = channel.uuid || channel.channel_uuid || channel.id
                return (
                  <div className="server-channel-row" key={id}>
                    <Link
                      className={`server-channel-link${String(id) === channelId ? ' is-active' : ''}`}
                      to={`/servers/${uuid}/channels/${id}`}
                    >
                      <span aria-hidden="true">{type === 'text' ? '#' : '◖'}</span>
                      <span>{channel.name}</span>
                    </Link>
                    {canManageChannels && (
                      <div className="server-channel-actions">
                        <button type="button" aria-label={`Edit ${channel.name}`} onClick={() => beginEditChannel(channel)}>Edit</button>
                        <button type="button" aria-label={`Delete ${channel.name}`} onClick={() => handleDeleteChannel(channel)}>×</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {channelGroups[type].length === 0 && (
                <p className="server-channel-empty">No {type} channels</p>
              )}
            </section>
          ))}
          {canManageChannels && (
            <p className="channel-context-hint">Right-click to create a channel</p>
          )}
        </div>
      </aside>

      <main className="server-channel-main">
        <header className="server-channel-header">
          {activeChannel ? (
            <>
              <span className="server-channel-header-type">{activeChannel.type === 'text' ? '#' : '◖'}</span>
              <h1>{activeChannel.name}</h1>
              <span className="server-channel-header-divider" />
              <p>{settings.description || serverName(server)}</p>
            </>
          ) : (
            <>
              <h1>{serverName(server)}</h1>
              <span className="server-channel-header-divider" />
              <p>{settings.description || 'Select a channel to get started.'}</p>
            </>
          )}
        </header>

        {error && <p className="server-workspace-error" role="alert">{error}</p>}
        {(messagesError || pollError) && (
          <p className="server-workspace-error" role="alert">{messagesError || pollError}</p>
        )}

        {!activeChannel ? (
          <div className="server-blank-canvas" aria-label="Server workspace">
            {!channels.length && <p>No channels yet.</p>}
          </div>
        ) : activeChannel.type === 'voice' ? (
          <div className="server-blank-canvas">
            <p>Voice channel</p>
          </div>
        ) : (
          <>
            <div className="chat-history" aria-live="polite">
              {hasOlderMessages && (
                <button
                  className="chat-load-older"
                  type="button"
                  onClick={handleLoadOlderMessages}
                  disabled={loadingOlder || !messages[0]?.uuid}
                >
                  {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
                </button>
              )}
              {messagesLoading ? (
                <p className="chat-loading">Loading messages…</p>
              ) : messages.length === 0 ? (
                <div className="chat-empty-state">
                  <span>#</span>
                  <h2>Welcome to #{activeChannel.name}</h2>
                  <p>This is the start of the conversation.</p>
                </div>
              ) : (
                messages.map((message) => {
                  const isAuthor = Boolean(user?.uuid && message.authorUuid === user.uuid)
                  return (
                    <article className="chat-message" key={message.uuid || `${message.authorUuid}-${message.timestamp?.getTime()}-${message.content}`}>
                      <span className="chat-message-avatar">{message.authorName.charAt(0).toUpperCase()}</span>
                      <div className="chat-message-body">
                        <div className="chat-message-meta">
                          <strong>{message.authorName}</strong>
                          {message.timestamp && (
                            <time dateTime={message.timestamp.toISOString()}>
                              {message.timestamp.toLocaleString()}
                            </time>
                          )}
                          {isAuthor && message.uuid && (
                            <div className="chat-message-actions">
                              <button type="button" onClick={() => beginEditMessage(message)}>Edit</button>
                              <button type="button" onClick={() => handleDeleteMessage(message)}>Delete</button>
                            </div>
                          )}
                        </div>
                        {editingMessageUuid === message.uuid ? (
                          <form className="chat-message-edit" onSubmit={handleUpdateMessage}>
                            <textarea
                              aria-label="Edit message"
                              value={editMessageContent}
                              maxLength={4000}
                              onChange={(event) => setEditMessageContent(event.target.value)}
                              autoFocus
                            />
                            <div>
                              <button type="button" onClick={() => setEditingMessageUuid('')} disabled={savingMessageEdit}>Cancel</button>
                              <button type="submit" disabled={!editMessageContent.trim() || savingMessageEdit}>
                                {savingMessageEdit ? 'Saving…' : 'Save'}
                              </button>
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
            <form className="chat-composer" onSubmit={handleSendMessage}>
              <input
                aria-label={`Message ${activeChannel.name}`}
                placeholder={`Message #${activeChannel.name}`}
                value={messageInput}
                maxLength={4000}
                onChange={(event) => setMessageInput(event.target.value)}
              />
              <button type="submit" disabled={!messageInput.trim() || sendingMessage || !activeChannelUuid}>
                {sendingMessage ? 'Sending…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </main>

      {contextMenu && (
        <div
          className="channel-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
          aria-label="Channel options"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setShowChannelTypes((shown) => !shown)}
          >
            Create new channel <span>{showChannelTypes ? '⌄' : '›'}</span>
          </button>
          {showChannelTypes && (
            <div className="channel-context-submenu">
              <button type="button" role="menuitem" onClick={() => beginCreateChannel('text')}># Text channel</button>
              <button type="button" role="menuitem" onClick={() => beginCreateChannel('voice')}>◖ Voice channel</button>
            </div>
          )}
        </div>
      )}

      {newChannelType && (
        <div className="channel-create-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setNewChannelType('')
        }}>
          <form className="channel-create-dialog" onSubmit={handleCreateChannel}>
            <h2>Create {newChannelType} channel</h2>
            <label htmlFor="new-channel-name">Channel name</label>
            <input
              id="new-channel-name"
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              placeholder="new-channel"
              maxLength={100}
              required
              autoFocus
            />
            {error && <p className="server-error" role="alert">{error}</p>}
            <div className="channel-create-dialog-actions">
              <button type="button" onClick={() => setNewChannelType('')} disabled={saving}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingChannel && (
        <div className="channel-create-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditingChannel(null)
        }}>
          <form className="channel-create-dialog" onSubmit={handleUpdateChannel}>
            <h2>Edit channel</h2>
            <label htmlFor="edit-channel-name">Channel name</label>
            <input
              id="edit-channel-name"
              value={editChannelName}
              onChange={(event) => setEditChannelName(event.target.value)}
              maxLength={100}
              required
              autoFocus
            />
            <label htmlFor="edit-channel-type">Channel type</label>
            <select
              id="edit-channel-type"
              value={editChannelType}
              onChange={(event) => setEditChannelType(event.target.value)}
            >
              <option value="text">Text</option>
              <option value="voice">Voice</option>
            </select>
            {error && <p className="server-error" role="alert">{error}</p>}
            <div className="channel-create-dialog-actions">
              <button type="button" onClick={() => setEditingChannel(null)} disabled={saving}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

export default ServerPage
