import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import serverIcon from './assets/server-svgrepo-com.svg'
import { apiPost, apiRequest } from './api/client.js'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { VoiceProvider, useVoice } from './voice/VoiceContext.jsx'
import { serverInitial, serverName, serverUuid, unwrapServer } from './api/servers.js'
import AuthPage from './pages/AuthPage.jsx'
import NotFoundPage from './pages/404Page.jsx'
import ProfileSettingsPage from './pages/ProfileSettingsPage.jsx'
import ServerPage from './pages/ServerPage.jsx'
import ServerSettingsPage from './pages/ServerSettingsPage.jsx'
import StartUpPage from './pages/StartUpPage.jsx'
import CreateServerDialog from './pages/CreateServerDialog.jsx'
import headphonesIcon from './assets/headphone-music-svgrepo-com.svg'
import headphonesMutedIcon from './assets/headphone-slash.svg'
import microphoneIcon from './assets/microphone-svgrepo-com.svg'
import microphoneMutedIcon from './assets/microphone-slash-svgrepo-com.svg'
import settingsIcon from './assets/settings-svgrepo-com.svg'

const SHARE_PRESETS = {
  '720p30': { width: 1280, height: 720, frameRate: 30 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60 },
}

function App() {
  return (
    <AuthProvider>
      <VoiceProvider>
        <AuthenticatedApp />
      </VoiceProvider>
    </AuthProvider>
  )
}

function AuthenticatedApp() {
  const [activeDmView, setActiveDmView] = useState('users')
  const [createServerOpen, setCreateServerOpen] = useState(false)
  const { servers, status, error, serversError, retry, refreshServers, user, logout } = useAuth()
  const {
    microphoneEnabled,
    microphoneBusy,
    microphoneActive,
    outputEnabled,
    status: voiceStatus,
    isSharing,
    setAudioContainerElement,
    toggleMicrophone,
    toggleOutput,
    startScreenShare,
    stopScreenShare,
  } = useVoice()
  const inCall = voiceStatus === 'connected'
  const confirmShare = async () => {
    setShareDialogOpen(false)
    await startScreenShare({ resolution: SHARE_PRESETS[shareQuality], audio: shareAudio })
  }
  const navigate = useNavigate()
  const retryServerLoading = async () => {
    try {
      await refreshServers()
    } catch {

    }
  }

  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareQuality, setShareQuality] = useState('1080p30')
  const [shareAudio, setShareAudio] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const avatarUrlRef = useRef(null)

  useEffect(() => {
    if (status !== 'authenticated') return undefined
    let active = true

    apiRequest('/me/profile/image', { responseType: 'blob' })
      .then((blob) => {
        if (!active) return
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current)
        const objectUrl = URL.createObjectURL(blob)
        avatarUrlRef.current = objectUrl
        setAvatarUrl(objectUrl)
      })
      .catch((imageError) => {
        if (!active || imageError.status !== 404) return
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current)
        avatarUrlRef.current = null
        setAvatarUrl(null)
      })

    return () => { active = false }
  }, [status, avatarVersion])

  useEffect(() => () => {
    if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current)
  }, [])

  useEffect(() => {
    const refresh = () => setAvatarVersion((v) => v + 1)
    window.addEventListener('avatar-changed', refresh)
    return () => window.removeEventListener('avatar-changed', refresh)
  }, [])

  if (status === 'checking') {
    return <div className="app-loading" role="status">Connecting to Connect…</div>
  }

  if (status === 'error') {
    return (
      <div className="app-loading app-loading-error" role="alert">
        <p>{error}</p>
        <button type="button" onClick={retry}>Try again</button>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const createServerDialog = createServerOpen ? (
    <CreateServerDialog
      onClose={() => setCreateServerOpen(false)}
      onCreate={async (details) => {
        const response = await apiPost('/servers', details)
        await refreshServers()
        const uuid = response?.uuid || response?.server?.uuid
        setCreateServerOpen(false)
        if (uuid) navigate(`/servers/${uuid}`)
      }}
    />
  ) : null

  return (
    <>
    <div className="app-shell">
      <nav className="ServerNavBar" aria-label="Main navigation">
        <Link
          className="server-nav-home"
          to="/"
          aria-label="Go to startup page"
          title="Startup"
        >
          <img src={serverIcon} alt="" />
        </Link>
        <div className="server-nav-divider" aria-hidden="true" />
        <div className="server-nav-list" aria-label="Your servers">
          {servers.map((server) => {
            const item = unwrapServer(server)
            const uuid = serverUuid(item)
            if (!uuid) return null
            return (
              <NavLink
                className="server-nav-item"
                key={uuid}
                to={`/servers/${uuid}`}
                aria-label={serverName(item)}
                title={serverName(item)}
              >
                {item.settings.profile_image
                  ? <img src={item.settings.profile_image} alt="" />
                  : <span>{serverInitial(item)}</span>}
              </NavLink>
            )
          })}
        </div>
        <button
          className="server-nav-add"
          type="button"
          aria-label="Create a server"
          title="Create a server"
          onClick={(event) => {
            event.preventDefault()
            setCreateServerOpen(true)
          }}
        >
          +
        </button>
      </nav>

      <main className="page-content">
        {serversError && (
          <div className="app-server-error" role="alert">
            <span>{serversError}</span>
            <button type="button" onClick={retryServerLoading}>Retry</button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <StartUpPage
                activeDmView={activeDmView}
                onChangeDmView={setActiveDmView}
                servers={servers}
              />
            }
          />
          <Route path="/servers/:uuid/channels/:channelId" element={<ServerPage />} />
          <Route path="/servers/:uuid" element={<ServerPage />} />
          <Route path="/servers/:uuid/settings" element={<ServerSettingsPage />} />
          <Route path="/server" element={<Navigate to="/" replace />} />
          <Route path="/profile-settings" element={<ProfileSettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <div className="profile">
        <div className="profile-identity">
          {avatarUrl ? (
            <img className="profile-avatar" src={avatarUrl} alt="Profile picture" />
          ) : (
            <span className="profile-avatar">{(user?.email || 'U').charAt(0).toUpperCase()}</span>
          )}
          <span className="profile-email" title={user?.email}>{user?.email || 'Connect user'}</span>
        </div>
        <div className="profile-audio-controls">
          <button
            className={`profile-icon-button${microphoneActive ? ' is-speaking' : ''}`}
            type="button"
            aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!microphoneEnabled}
            title={microphoneActive ? 'Microphone is picking up audio' : 'Toggle microphone'}
            disabled={microphoneBusy || voiceStatus === 'connecting'}
            onClick={() => void toggleMicrophone()}
          >
            <img src={microphoneEnabled ? microphoneIcon : microphoneMutedIcon} alt="" />
          </button>
          <button
            className="profile-icon-button"
            type="button"
            aria-label={outputEnabled ? 'Mute headphones' : 'Unmute headphones'}
            aria-pressed={!outputEnabled}
            disabled={microphoneBusy || voiceStatus === 'connecting'}
            onClick={toggleOutput}
          >
            <img src={outputEnabled ? headphonesIcon : headphonesMutedIcon} alt="" />
          </button>
          <button
            className={`profile-icon-button${isSharing ? ' is-speaking' : ''}`}
            type="button"
            aria-label={isSharing ? 'Stop screen share' : 'Share screen'}
            aria-pressed={isSharing}
            title={isSharing ? 'Übertragung beenden' : 'Bildschirm teilen'}
            disabled={!inCall}
            onClick={() => (isSharing ? void stopScreenShare() : setShareDialogOpen(true))}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="4" width="20" height="13" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </button>
        </div>
        <div className="voice-audio-container" ref={setAudioContainerElement} aria-hidden="true" />
        <Link
          className="profile-icon-button profile-settings-button"
          to="/profile-settings"
          aria-label="Profile settings"
          title="Profile settings"
        >
          <img src={settingsIcon} alt="" />
        </Link>
          </div>
          {shareDialogOpen && (
      <div className="share-overlay" onClick={() => setShareDialogOpen(false)}>
        <div className="share-dialog" role="dialog" aria-modal="true"
            onClick={(e) => e.stopPropagation()}>
          <h3>Bildschirm teilen</h3>

          <label>
            Qualität
            <select value={shareQuality} onChange={(e) => setShareQuality(e.target.value)}>
              <option value="720p30">720p · 30 FPS</option>
              <option value="1080p30">1080p · 30 FPS</option>
              <option value="1080p60">1080p · 60 FPS</option>
            </select>
          </label>

          <label>
            <input type="checkbox" checked={shareAudio}
                  onChange={(e) => setShareAudio(e.target.checked)} />
            Systemton mitübertragen
          </label>

          <div className="share-dialog-actions">
            <button type="button" onClick={() => setShareDialogOpen(false)}>Abbrechen</button>
            <button type="button" onClick={() => void confirmShare()}>Weiter</button>
          </div>
        </div>
      </div>
    )}
    </div>
    {createServerDialog}
    </>
  )
}

export default App
