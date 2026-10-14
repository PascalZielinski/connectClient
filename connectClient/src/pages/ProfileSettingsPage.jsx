import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { VoiceControls } from '../api/audio.js'
import { apiRequest } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useVoice } from '../voice/VoiceContext.jsx'
import AvatarCropper from '../components/AvatarCropper.jsx'
import './ServerPage.css'

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.8-3.6-5-8-5Z" />
    </svg>
  )
}

function IconMic() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2Z" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function ProfileSettingsPage() {
  const navigate = useNavigate()
  const microphoneControlsRef = useRef(null)
  const voiceControlsRef = useRef(null)
  const headphoneControlsRef = useRef(null)
  const { logout } = useAuth()
  const {
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    deviceError,
    selectInputDevice,
    selectOutputDevice,
    setHeadphoneVolume,
    setNoiseSuppression,
    requestDeviceAccess,
  } = useVoice()
  const [tab, setTab] = useState('profile')
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ display_name: '', bio: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [microphoneReady, setMicrophoneReady] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [monitorError, setMonitorError] = useState('')
  const fileInputRef = useRef(null)
  const [cropSrc, setCropSrc] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [avatarVersion, setAvatarVersion] = useState(0)
  const avatarUrlRef = useRef(null)
  const hasProfile = Boolean(profile)

  // Close overlay with ESC
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && !cropSrc) navigate('/')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cropSrc, navigate])

  // Voice controls only exist while the "Voice & Audio" tab is mounted
  useEffect(() => {
    if (loading || tab !== 'voice' || !microphoneControlsRef.current || !headphoneControlsRef.current) return undefined
    const controls = new VoiceControls(microphoneControlsRef.current, {
      deviceId: inputDeviceId || undefined,
      headphoneContainer: headphoneControlsRef.current,
      onHeadphoneVolumeChange: setHeadphoneVolume,
      onNoiseSuppressionChange: setNoiseSuppression,
      onStream: () => setMicrophoneReady(true),
      storageKey: 'connect.audioSettings',
    })
    voiceControlsRef.current = controls
    return () => {
      void controls.setMonitoring(false)
      controls.destroy()
      voiceControlsRef.current = null
      setMicrophoneReady(false)
      setMonitoring(false)
    }
  }, [loading, tab, inputDeviceId, setHeadphoneVolume, setNoiseSuppression])

  useEffect(() => {
    let active = true
    apiRequest('/me/profile')
      .then((data) => {
        if (!active) return
        const loaded = data?.profile || data
        setProfile(loaded)
        setForm({
          display_name: loaded?.display_name || '',
          bio: loaded?.bio || '',
        })
      })
      .catch((loadError) => {
        if (!active) return
        if (loadError.status !== 404) {
          setError(loadError.message || 'Could not load your profile.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!hasProfile) return undefined
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
        if (!active || imageError.status === 404) return
        setError(imageError.message || 'Could not load your profile picture.')
      })

    return () => { active = false }
  }, [hasProfile, avatarVersion])

  useEffect(() => () => {
    if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current)
  }, [])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function onFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large (max 10 MB).')
      return
    }
    setError('')
    setCropSrc(URL.createObjectURL(file))
  }

  async function handleCropped(blob) {
    setUploading(true)
    setError('')
    setFeedback('')
    try {
      const body = new FormData()
      body.append('image', blob, 'avatar.jpg')
      await apiRequest('/me/profile/image', { method: 'POST', body })

      setAvatarVersion((v) => v + 1)
      window.dispatchEvent(new Event('avatar-changed'))
      setFeedback('Profile picture updated.')
      closeCropper()
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload the image.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const result = await apiRequest('/me/profile', {
        method: profile ? 'PUT' : 'POST',
        body: JSON.stringify({
          display_name: form.display_name.trim(),
          bio: form.bio.trim(),
        }),
      })
      setProfile(result?.profile || result || form)
      setFeedback('Your profile has been saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleMicrophoneMonitor() {
    const nextMonitoring = !monitoring
    const controls = voiceControlsRef.current
    setMonitorError('')
    try {
      await controls?.setMonitoring(nextMonitoring)
      if (voiceControlsRef.current !== controls) return
      setMonitoring(nextMonitoring)
    } catch (monitorError) {
      setMonitorError(monitorError.message || 'Could not play the microphone audio.')
    }
  }

  if (loading) {
    return (
      <div className="ps-overlay">
        <section className="ps-modal ps-modal-loading">
          <p className="ps-loading">Loading your profile…</p>
        </section>
      </div>
    )
  }

  const sidebarName = form.display_name || profile?.display_name || 'Your profile'

  return (
    <div className="ps-overlay" role="dialog" aria-modal="true" aria-labelledby="ps-heading">
      <section className="ps-modal">
        {/* ---------- Sidebar ---------- */}
        <aside className="ps-sidebar">
          <div className="ps-user">
            {avatarUrl ? (
              <img className="ps-user-avatar" src={avatarUrl} alt="" width={48} height={48} />
            ) : (
              <div className="ps-user-avatar ps-avatar-fallback">{sidebarName.charAt(0).toUpperCase()}</div>
            )}
            <div className="ps-user-text">
              <span className="ps-user-name">{sidebarName}</span>
              <span className="ps-user-sub">Profile settings</span>
            </div>
          </div>

          <nav className="ps-nav" aria-label="Settings">
            <span className="ps-nav-category">User settings</span>
            <button
              type="button"
              className={`ps-nav-item ${tab === 'profile' ? 'is-active' : ''}`}
              onClick={() => setTab('profile')}
            >
              <IconUser /> Profile
            </button>
            <button
              type="button"
              className={`ps-nav-item ${tab === 'voice' ? 'is-active' : ''}`}
              onClick={() => setTab('voice')}
            >
              <IconMic /> Voice &amp; Audio
            </button>
          </nav>

          <div className="ps-sidebar-footer">
            <hr className="ps-divider" />
            <Link className="ps-nav-item" to="/">← Back to Connect</Link>
            <button className="ps-nav-item ps-danger" type="button" onClick={logout}>Sign out</button>
          </div>
        </aside>

        {/* ---------- Content ---------- */}
        <div className="ps-content">
          <header className="ps-topbar">
            <h1 id="ps-heading">Profile settings</h1>
            <Link className="ps-close" to="/" aria-label="Back to Connect" title="Back to Connect (Esc)">
              <IconClose />
            </Link>
          </header>

          <div className="ps-scroll">
            <div className="ps-column">
              {error && <p className="ps-alert ps-alert-error" role="alert">{error}</p>}
              {feedback && <p className="ps-alert ps-alert-success" role="status">{feedback}</p>}

              {tab === 'profile' && (
                <form className="ps-form" onSubmit={handleSave}>
                  <h2 className="ps-title">Profile</h2>

                  <div className="ps-profile-card">
                    <div className="ps-avatar-col">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={onFileChange}
                        hidden
                      />
                      {avatarUrl ? (
                        <img className="ps-avatar" src={avatarUrl} alt="Profile picture" width={96} height={96} />
                      ) : (
                        <div className="ps-avatar ps-avatar-fallback" aria-hidden="true">
                          {sidebarName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <button
                        className="ps-btn ps-btn-secondary Upload-Button"
                        type="button"
                        disabled={!profile || uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? 'Uploading…' : 'Change picture'}
                      </button>
                      {!profile && <p className="ps-hint">Save your profile first, then you can add a picture.</p>}
                    </div>

                    <div className="ps-fields-col">
                      <div className="ps-field">
                        <label htmlFor="profile-display-name">Display name</label>
                        <input
                          id="profile-display-name"
                          className="ps-input"
                          name="display_name"
                          value={form.display_name}
                          onChange={updateField}
                          maxLength={100}
                          required
                        />
                      </div>
                      <div className="ps-field">
                        <label htmlFor="profile-bio">Bio</label>
                        <textarea
                          id="profile-bio"
                          className="ps-input ps-textarea"
                          name="bio"
                          value={form.bio}
                          onChange={updateField}
                          rows={5}
                          maxLength={500}
                        />
                      </div>
                    </div>
                  </div>

                  {cropSrc && <AvatarCropper src={cropSrc} onDone={handleCropped} onCancel={closeCropper} />}

                  <div className="ps-savebar settings-actions">
                    <button className="ps-btn ps-btn-primary" type="submit" disabled={saving}>
                      {saving ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
                    </button>
                  </div>
                </form>
              )}

              {tab === 'voice' && (
                <div className="ps-form">
                  <h2 className="ps-title">Voice chat</h2>

                  <div className="ps-grid">
                    <div className="ps-field">
                      <label htmlFor="audio-input-device">Input device</label>
                      <select
                        id="audio-input-device"
                        className="ps-input ps-select"
                        value={inputDeviceId}
                        onChange={(event) => void selectInputDevice(event.target.value)}
                      >
                        <option value="">System default</option>
                        {inputDeviceId && !inputDevices.some((device) => device.deviceId === inputDeviceId) && (
                          <option value={inputDeviceId}>Saved microphone unavailable</option>
                        )}
                        {inputDevices.map((device, index) => (
                          <option key={device.deviceId || `input-${index}`} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="ps-field">
                      <label htmlFor="audio-output-device">Output device</label>
                      <select
                        id="audio-output-device"
                        className="ps-input ps-select"
                        value={outputDeviceId}
                        onChange={(event) => void selectOutputDevice(event.target.value)}
                      >
                        <option value="">System default</option>
                        {outputDeviceId && !outputDevices.some((device) => device.deviceId === outputDeviceId) && (
                          <option value={outputDeviceId}>Saved output unavailable</option>
                        )}
                        {outputDevices.map((device, index) => (
                          <option key={device.deviceId || `output-${index}`} value={device.deviceId}>
                            {device.label || `Output ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="ps-controls" ref={microphoneControlsRef} />
                    <div className="ps-controls" ref={headphoneControlsRef} />
                  </div>

                  <div className="ps-test-row">
                    <button
                      className={`ps-btn ps-btn-primary ${monitoring ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => void toggleMicrophoneMonitor()}
                      disabled={!microphoneReady}
                    >
                      {monitoring ? 'Stop hearing yourself' : 'Hear yourself'}
                    </button>
                  </div>
                  {monitorError && <p className="ps-alert ps-alert-error" role="alert">{monitorError}</p>}

                  <hr className="ps-divider ps-divider-wide" />

                  <button className="ps-btn ps-btn-secondary" type="button" onClick={() => void requestDeviceAccess()}>
                    Allow microphone access and refresh devices
                  </button>
                  {deviceError && <p className="ps-alert ps-alert-error" role="alert">{deviceError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ProfileSettingsPage