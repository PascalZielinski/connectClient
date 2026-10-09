import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client.js'
import { serverName, unwrapServer } from '../api/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'
import './ServerPage.css'

function ServerSettingsPage() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const { refreshServers } = useAuth()
  const [server, setServer] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', profile_image: '', publicy: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    let active = true
    apiRequest(`/servers/${uuid}`)
      .then((data) => {
        if (!active) return
        const loaded = unwrapServer(data)
        const settings = loaded.settings || loaded
        setServer(loaded)
        setForm({
          name: settings.name || '',
          description: settings.description || '',
          profile_image: settings.profile_image || '',
          publicy: Boolean(settings.publicy),
        })
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load server settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [uuid])

  function updateField(event) {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const updated = await apiRequest(`/servers/${uuid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          profile_image: form.profile_image.trim(),
          publicy: form.publicy,
        }),
      })
      setServer(unwrapServer(updated || { ...server, settings: form }))
      await refreshServers()
      setFeedback('Server settings saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save server settings.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${serverName(server)}"? This cannot be undone.`)) return
    setError('')
    try {
      await apiRequest(`/servers/${uuid}`, { method: 'DELETE' })
      await refreshServers()
      navigate('/', { replace: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this server.')
    }
  }

  if (loading) return <section className="server-page"><p className="server-loading">Loading settings…</p></section>

  return (
    <section className="server-page server-settings-page">
      <Link className="server-back-link" to={`/servers/${uuid}`}>← Back to server</Link>
      <span className="section-kicker">SERVER CONTROL</span>
      <h1>{server ? `Settings for ${serverName(server)}` : 'Server settings'}</h1>
      <p className="server-page-intro">Shape how your community looks and who can find it.</p>
      {error && <p className="server-error" role="alert">{error}</p>}
      {feedback && <p className="server-success" role="status">{feedback}</p>}
      <form className="server-settings-form" onSubmit={handleSave}>
        <label htmlFor="settings-name">Server name</label>
        <input id="settings-name" name="name" value={form.name} onChange={updateField} maxLength={100} required />
        <label htmlFor="settings-description">Description</label>
        <textarea id="settings-description" name="description" value={form.description} onChange={updateField} rows={4} maxLength={500} />
        <label htmlFor="settings-image">Profile image URL</label>
        <input id="settings-image" name="profile_image" type="url" value={form.profile_image} onChange={updateField} placeholder="https://example.com/image.png" />
        <label className="settings-public-toggle">
          <input name="publicy" type="checkbox" checked={form.publicy} onChange={updateField} />
          <span>Make this server public</span>
        </label>
        <div className="settings-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button className="danger-button" type="button" onClick={handleDelete}>Delete server</button>
        </div>
      </form>
    </section>
  )
}

export default ServerSettingsPage
