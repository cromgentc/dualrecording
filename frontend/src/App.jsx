import { useEffect, useState } from 'react'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import VendorPage from './pages/VendorPage'
import SetupRecordingPage from './pages/SetupRecordingPage'
import StudioPage from './pages/StudioPage'
import { AUTH_TOKEN_KEY, apiRequest } from './lib/podcast'

function App() {
  // Query params decide whether the logged-in user opens a studio invite directly.
  const params = new URLSearchParams(window.location.search)
  const sessionId = params.get('session')
  const role = params.get('role')
  const token = params.get('token')
  const isStudioRoute = Boolean(sessionId && role && token)
  const storedToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || ''

  const [authToken, setAuthToken] = useState(storedToken)
  const [authUser, setAuthUser] = useState(null)
  const [authResolved, setAuthResolved] = useState(!storedToken)
  const checkingAuth = Boolean(authToken) && !authUser && !authResolved

  useEffect(() => {
    // Restore a saved login before showing the dashboard or auth page.
    if (!authToken) {
      return
    }

    let cancelled = false

    apiRequest('/api/auth/me', { authToken })
      .then((payload) => {
        if (cancelled) {
          return
        }
        setAuthUser(payload.user)
        setAuthResolved(true)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
        setAuthToken('')
        setAuthUser(null)
        setAuthResolved(true)
      })

    return () => {
      cancelled = true
    }
  }, [authToken])

  function handleAuthenticated(payload) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, payload.token)
    setAuthToken(payload.token)
    setAuthUser(payload.user)
    setAuthResolved(true)
  }

  async function handleLogout() {
    try {
      if (authToken) {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          authToken,
        })
      }
    } catch {
      // Local cleanup still runs below.
    } finally {
      window.localStorage.removeItem(AUTH_TOKEN_KEY)
      setAuthToken('')
      setAuthUser(null)
      setAuthResolved(true)
    }
  }

  if (isStudioRoute) {
    return (
      <StudioPage
        sessionId={sessionId}
        role={role}
        token={token}
        user={authUser}
        onLogout={handleLogout}
      />
    )
  }

  if (checkingAuth) {
    return (
      <main className="page-shell py-8">
        <div className="glass-card p-8 text-center text-stone-200">Checking login...</div>
      </main>
    )
  }

  if (!authUser) {
    return <AuthPage onAuthenticated={handleAuthenticated} />
  }

  if (authUser.role === 'admin') {
    return <AdminPage authToken={authToken} user={authUser} onLogout={handleLogout} />
  }

  if (authUser.role === 'vendor') {
    return <VendorPage authToken={authToken} user={authUser} onLogout={handleLogout} />
  }

  return (
    <SetupRecordingPage authToken={authToken} user={authUser} onLogout={handleLogout} />
  )
}

export default App
