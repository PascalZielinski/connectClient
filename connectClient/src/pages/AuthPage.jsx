import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import './AuthPage.css'

function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { authenticate, error: authError, status } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (status === 'authenticated') return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (isRegister && password !== passwordConfirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const credentials = isRegister
        ? { email, password, password_confirm: passwordConfirm }
        : { email, password }
      await authenticate(isRegister ? '/register' : '/login', credentials)
      navigate('/', { replace: true })
    } catch (submitError) {
      setError(submitError.message || 'We could not complete your request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" to="/" aria-label="Connect home">
          <span>connect</span>
        </Link>
        <h1>{isRegister ? 'Create your account' : 'Sign in to Connect'}</h1>
        <p className="auth-intro">
          {isRegister
            ? 'Create an account to get started.'
            : 'Welcome back. Enter your account details to continue.'}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? 'At least 8 characters' : 'Your password'}
            required
          />
          {isRegister && (
            <>
              <label htmlFor="auth-password-confirm">Confirm password</label>
              <input
                id="auth-password-confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="Re-enter your password"
                required
              />
            </>
          )}
          {(error || authError) && <p className="auth-error" role="alert">{error || authError}</p>}
          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New to Connect?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </section>
    </main>
  )
}

export default AuthPage
