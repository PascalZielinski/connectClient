import { useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import serverIcon from './assets/server-svgrepo-com.svg'
import { apiPost } from './api/client.js'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import AuthPage from './pages/AuthPage.jsx'
import NotFoundPage from './pages/404Page.jsx'
import ProfileSettingsPage from './pages/ProfileSettingsPage.jsx'
import ServerPage from './pages/ServerPage.jsx'
import ServerSettingsPage from './pages/ServerSettingsPage.jsx'
import StartUpPage from './pages/StartUpPage.jsx'
import CreateServerDialog from './pages/CreateServerDialog.jsx'
import { serverInitial, serverName, serverUuid, unwrapServer } from './api/servers.js'
import headphonesIcon from './assets/headphone-music-svgrepo-com.svg'
import headphonesMutedIcon from './assets/headphone-slash.svg'
import microphoneIcon from './assets/microphone-svgrepo-com.svg'
import microphoneMutedIcon from './assets/microphone-slash-svgrepo-com.svg'
import settingsIcon from './assets/settings-svgrepo-com.svg'

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}

function AuthenticatedApp() {
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [headphonesEnabled, setHeadphonesEnabled] = useState(true)
  const [activeDmView, setActiveDmView] = useState('users')
  const [createServerOpen, setCreateServerOpen] = useState(false)
  const { servers, status, error, retry, refreshServers, user, logout } = useAuth()
  const navigate = useNavigate()

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
          <span className="profile-avatar">{(user?.email || 'U').charAt(0).toUpperCase()}</span>
          <span className="profile-email" title={user?.email}>{user?.email || 'Connect user'}</span>
        </div>
        <div className="profile-audio-controls">
          <button
            className="profile-icon-button"
            type="button"
            aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!microphoneEnabled}
            onClick={() => setMicrophoneEnabled((enabled) => !enabled)}
          >
            <img src={microphoneEnabled ? microphoneIcon : microphoneMutedIcon} alt="" />
          </button>
          <button
            className="profile-icon-button"
            type="button"
            aria-label={headphonesEnabled ? 'Mute headphones' : 'Unmute headphones'}
            aria-pressed={!headphonesEnabled}
            onClick={() => setHeadphonesEnabled((enabled) => !enabled)}
          >
            <img src={headphonesEnabled ? headphonesIcon : headphonesMutedIcon} alt="" />
          </button>
        </div>
        <Link
          className="profile-icon-button profile-settings-button"
          to="/profile-settings"
          aria-label="Profile settings"
          title="Profile settings"
        >
          <img src={settingsIcon} alt="" />
        </Link>
      </div>
    </div>
    {createServerDialog}
    </>
  )
}

export default App
