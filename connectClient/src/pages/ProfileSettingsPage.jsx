import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useVoice } from '../voice/VoiceContext.jsx'
import './ServerPage.css'

function ProfileSettingsPage() {
  const { logout } = useAuth()
  const {
    inputDevices,
    outputDevices,
    inputDeviceId,
    outputDeviceId,
    deviceError,
    selectInputDevice,
    selectOutputDevice,
    requestDeviceAccess,
  } = useVoice()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ display_name: '', bio: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

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

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
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

  if (loading) return <section className="server-page"><p className="server-loading">Loading your profile…</p></section>

  return (
    <section className="server-page server-settings-page">
      <Link className="server-back-link" to="/">← Back to Connect</Link>
      <h1>Profile settings</h1>
      {error && <p className="server-error" role="alert">{error}</p>}
      {feedback && <p className="server-success" role="status">{feedback}</p>}
      <form className="server-settings-form" onSubmit={handleSave}>
        <label htmlFor="profile-display-name">Display name</label>
        <input
          id="profile-display-name"
          name="display_name"
          value={form.display_name}
          onChange={updateField}
          maxLength={100}
          required
        />
        <label htmlFor="profile-bio">Bio</label>
        <textarea id="profile-bio" name="bio" value={form.bio} onChange={updateField} rows={5} maxLength={500} />
        <label htmlFor="audio-input-device">Input device</label>
        <select
          id="audio-input-device"
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
        <label htmlFor="audio-output-device">Output device</label>
        <select
          id="audio-output-device"
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
        <button className="subtle-button" type="button" onClick={() => void requestDeviceAccess()}>
          Allow microphone access and refresh devices
        </button>
        {deviceError && <p className="server-error" role="alert">{deviceError}</p>}
        <div className="settings-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
          </button>
          <button className="danger-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </form>
    </section>
  )
}

export default ProfileSettingsPage
