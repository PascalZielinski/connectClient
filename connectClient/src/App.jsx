import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import serverIcon from './assets/server-svgrepo-com.svg'
import NotFoundPage from './pages/404Page.jsx'
import ProfileSettingsPage from './pages/ProfileSettingsPage.jsx'
import ServerPage from './pages/ServerPage.jsx'
import ServerSettingsPage from './pages/ServerSettingsPage.jsx'
import StartUpPage from './pages/StartUpPage.jsx'

function App() {
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true)
  const [headphonesEnabled, setHeadphonesEnabled] = useState(true)
  const [activeDmView, setActiveDmView] = useState('users')

  return (
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
      </nav>

      <main className="page-content">
        <Routes>
          <Route
            path="/"
            element={
              <StartUpPage
                microphoneEnabled={microphoneEnabled}
                headphonesEnabled={headphonesEnabled}
                activeDmView={activeDmView}
                onToggleMicrophone={() => setMicrophoneEnabled((enabled) => !enabled)}
                onToggleHeadphones={() => setHeadphonesEnabled((enabled) => !enabled)}
                onChangeDmView={setActiveDmView}
              />
            }
          />
          <Route path="/server" element={<ServerPage />} />
          <Route path="/profile-settings" element={<ProfileSettingsPage />} />
          <Route path="/server-settings" element={<ServerSettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
