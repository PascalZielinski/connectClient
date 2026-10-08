import { Link } from 'react-router-dom'
import friendIcon from '../assets/friend-3-svgrepo-com.svg'
import headphonesIcon from '../assets/headphone-music-svgrepo-com.svg'
import headphonesMutedIcon from '../assets/headphone-slash.svg'
import microphoneIcon from '../assets/microphone-svgrepo-com.svg'
import microphoneMutedIcon from '../assets/microphone-slash-svgrepo-com.svg'
import serverIcon from '../assets/server-svgrepo-com.svg'
import settingsIcon from '../assets/settings-svgrepo-com.svg'
import './StartUpPage.css'

function StartUpPage({
  microphoneEnabled,
  headphonesEnabled,
  activeDmView,
  onToggleMicrophone,
  onToggleHeadphones,
  onChangeDmView,
}) {
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
      </div>

      <section className="workspace-content" aria-live="polite">
        <h1>{activeDmView === 'users' ? 'User' : 'Server'}</h1>
        <input
          key={activeDmView}
          className="workspace-search"
          type="search"
          aria-label={activeDmView === 'users' ? 'Search users' : 'Search servers'}
          placeholder={activeDmView === 'users' ? 'Search users...' : 'Search servers...'}
        />
        <p>
          {activeDmView === 'users'
            ? 'Users and direct messages will appear here.'
            : 'Your servers will appear here.'}
        </p>
      </section>

      <div className="profile">
        <div className="profile-audio-controls">
          <button
            className="profile-icon-button"
            type="button"
            aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!microphoneEnabled}
            onClick={onToggleMicrophone}
          >
            <img src={microphoneEnabled ? microphoneIcon : microphoneMutedIcon} alt="" />
          </button>
          <button
            className="profile-icon-button"
            type="button"
            aria-label={headphonesEnabled ? 'Mute headphones' : 'Unmute headphones'}
            aria-pressed={!headphonesEnabled}
            onClick={onToggleHeadphones}
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
  )
}

export default StartUpPage