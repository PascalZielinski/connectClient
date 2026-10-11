import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api/client.js'
import { serverList, serverName, serverUuid } from '../api/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'
import friendIcon from '../assets/friend-3-svgrepo-com.svg'
import serverIcon from '../assets/server-svgrepo-com.svg'
import './StartUpPage.css'

function StartUpPage({
  activeDmView,
  onChangeDmView,
  servers,
}) {
  const { refreshServers } = useAuth()
  const [userQuery, setUserQuery] = useState('')
  const [serverQuery, setServerQuery] = useState('')
  const [searchUsers, setSearchUsers] = useState([])
  const [discoverableServers, setDiscoverableServers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingDiscovery, setLoadingDiscovery] = useState(false)
  const [userSearchError, setUserSearchError] = useState('')
  const [serverSearchError, setServerSearchError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const term = userQuery.trim()
    if (activeDmView !== 'users' || !term) {
      setSearchUsers([])
      setLoadingUsers(false)
      setUserSearchError('')
      return undefined
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoadingUsers(true)
      setUserSearchError('')
      apiRequest(`/users/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) {
            const users = Array.isArray(data) ? data : data?.users || data?.results || data?.data || []
            setSearchUsers(Array.isArray(users) ? users : [])
          }
        })
        .catch((loadError) => {
          if (!controller.signal.aborted) {
            setUserSearchError(loadError.message || 'Could not search users.')
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingUsers(false)
        })
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [activeDmView, userQuery])

  useEffect(() => {
    if (activeDmView !== 'servers') {
      setLoadingDiscovery(false)
      return undefined
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoadingDiscovery(true)
      setServerSearchError('')
      const term = serverQuery.trim()
      const endpoint = term
        ? `/servers/search?q=${encodeURIComponent(term)}`
        : '/servers'
      apiRequest(endpoint, { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setDiscoverableServers(serverList(data))
        })
        .catch((loadError) => {
          if (!controller.signal.aborted) {
            setServerSearchError(loadError.message || 'Could not load public servers.')
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingDiscovery(false)
        })
    }, serverQuery.trim() ? 250 : 0)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [activeDmView, serverQuery])

  const joinedIds = useMemo(() => new Set(servers.map(serverUuid)), [servers])
  const visibleServers = discoverableServers

  async function handleJoin(server) {
    const uuid = serverUuid(server)
    if (!uuid) return
    setError('')
    setFeedback('')
    try {
      await apiRequest(`/servers/${uuid}/join`, { method: 'POST' })
      await refreshServers()
      setFeedback(`You joined ${serverName(server)}.`)
    } catch (requestError) {
      setError(requestError.message || 'Could not join this server.')
    }
  }

  return (
    <div className="startup-page">
      <div className="DmNavBar">
        <div className="dm-nav-bar-header">
          <button
            className="dm-nav-button"
            type="button"
            aria-pressed={activeDmView === 'users'}
            onClick={() => onChangeDmView('users')}
          >
            <img src={friendIcon} alt="" />
            User
          </button>
          <button
            className="dm-nav-button"
            type="button"
            aria-pressed={activeDmView === 'servers'}
            onClick={() => onChangeDmView('servers')}
          >
            <img src={serverIcon} alt="" />
            Server
          </button>
        </div>
        <div className="dm-server-actions">
          <p className="sidebar-label">YOUR COMMUNITY</p>
          <div className="dm-server-list">
            {servers.map((server) => {
              const uuid = serverUuid(server)
              if (!uuid) return null
              return (
                <Link className="dm-server-link" key={uuid} to={`/servers/${uuid}`}>
                  <span className="dm-server-avatar">{serverName(server).charAt(0).toUpperCase()}</span>
                  <span>{serverName(server)}</span>
                </Link>
              )
            })}
            {servers.length === 0 && <p className="sidebar-empty">Your joined servers will show up here.</p>}
          </div>
        </div>
      </div>

      <section className="workspace-content" aria-live="polite">
        <span className="workspace-eyebrow">YOUR CONNECT SPACE</span>
        <h1>{activeDmView === 'users' ? 'Find users' : 'Find your people'}</h1>
        <p className="workspace-lead">
          {activeDmView === 'users'
            ? 'Search for people by display name or user UUID.'
            : 'Find a public server by name or UUID and join the conversation.'}
        </p>
        {activeDmView === 'users' ? (
          <section className="search-section" aria-label="Search users">
            <input
              className="workspace-search"
              type="search"
              aria-label="Search users by display name or UUID"
              placeholder="Search users..."
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
            />
            {userSearchError && <p className="inline-error" role="alert">{userSearchError}</p>}
            {loadingUsers ? (
              <p className="empty-state">Searching users…</p>
            ) : userQuery.trim() && searchUsers.length === 0 && !userSearchError ? (
              <p className="empty-state">No users found.</p>
            ) : (
            <div className="discovery-list user-search-results">
              {searchUsers.map((result) => (
                <article className="discovery-card user-result" key={result.uuid}>
                  <button
                    className="open-dm-button"
                    onClick={() => openDirectMessage(result)}
                    type="button"
                  >
                    DirectMessage
                  </button>

                  <span className="discovery-avatar">
                    {(result.display_name || '?').charAt(0).toUpperCase()}
                  </span>

                  <div className="discovery-info">
                    <h3>{result.display_name || 'User'}</h3>
                  </div>
                </article>
              ))}
            </div>
            )}
          </section>
        ) : (
          <div className="server-discovery">
            <section className="discover-section">
              <div className="section-heading discover-heading">
                <div>
                  <span className="section-kicker">OPEN TO EVERYONE</span>
                  <h2>Public servers</h2>
                </div>
                <input
                  className="workspace-search"
                  type="search"
                  aria-label="Search servers by name or UUID"
                  placeholder="Search servers..."
                  value={serverQuery}
                  onChange={(event) => setServerQuery(event.target.value)}
                />
              </div>
              {serverSearchError && <p className="inline-error" role="alert">{serverSearchError}</p>}
              {error && <p className="inline-error" role="alert">{error}</p>}
              {feedback && <p className="inline-success" role="status">{feedback}</p>}
              {loadingDiscovery ? (
                <p className="empty-state">Loading public servers…</p>
              ) : visibleServers.length === 0 ? (
                <p className="empty-state">{serverQuery.trim() ? 'No servers match your search.' : 'No public servers to discover yet.'}</p>
              ) : (
                <div className="discovery-list">
                  {visibleServers.map((server) => {
                    const uuid = serverUuid(server)
                    const joined = joinedIds.has(uuid)
                    return (
                      <article className="discovery-card" key={uuid || serverName(server)}>
                        <span className="discovery-avatar">{serverName(server).charAt(0).toUpperCase()}</span>
                        <div className="discovery-info">
                          <h3>{serverName(server)}</h3>
                          <p>{server.settings.description || 'A community on Connect.'}</p>
                          <span>{server.member_count ?? 0} members</span>
                        </div>
                        {joined ? (
                          <Link className="secondary-button" to={`/servers/${uuid}`}>Open</Link>
                        ) : (
                          <button className="secondary-button" type="button" onClick={() => handleJoin(server)}>
                            Join
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

export default StartUpPage