import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import SessionCard from '../components/SessionCard'
import UserBar from '../components/UserBar'
import { apiRequest, POLL_INTERVAL } from '../lib/podcast'

function DashboardPage({ authToken, user, onLogout }) {
  // Legacy dashboard view mirrors the user recording-room workflow.
  const [sessions, setSessions] = useState([])
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    hostLabel: 'Speaker 1',
    guestLabel: 'Speaker 2',
  })

  const loadSessions = useEffectEvent(async () => {
    // Refresh the dashboard periodically so participant/recording states update.
    try {
      const data = await apiRequest('/api/sessions', { authToken })
      startTransition(() => setSessions(data))
    } catch (error) {
      setMessage(error.message)
    }
  })

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadSessions()
    }, 0)

    const intervalId = window.setInterval(() => {
      void loadSessions()
    }, POLL_INTERVAL)

    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [authToken])

  async function handleCreateSession(event) {
    // New sessions are inserted optimistically at the top after the API confirms them.
    event.preventDefault()
    setCreating(true)
    setMessage('')

    try {
      const session = await apiRequest('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(form),
        authToken,
      })

      setForm({
        title: '',
        hostLabel: 'Speaker 1',
        guestLabel: 'Speaker 2',
      })
      setSessions((current) => [session, ...current])
      setMessage('Session ready. Host aur guest dono ke invite links generate ho gaye hain.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="page-shell py-8">
      <UserBar user={user} onLogout={onLogout} />

      <section className="glass-card grid gap-7 overflow-hidden bg-[linear-gradient(130deg,rgba(11,34,44,0.96),rgba(18,52,62,0.94))] p-8 lg:grid-cols-[1.4fr_0.9fr]">
        <div>
          <p className="eyebrow">Remote Podcast Console</p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-stone-50 md:text-6xl">
            Login ke baad aapka recording dashboard yahin open hota hai.
          </h1>
          <p className="mt-4 max-w-3xl text-base text-stone-200/85 md:text-lg">
            Har logged-in user apne khud ke podcast sessions manage karega. Session
            create karo, host aur guest invite bhejo, aur 3 tracks download karo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-3xl border border-white/10 bg-white/8 p-5">
            <span className="eyebrow">Your Sessions</span>
            <strong className="mt-2 block text-5xl font-semibold text-stone-50">
              {sessions.length}
            </strong>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/8 p-5">
            <span className="eyebrow">Ready Exports</span>
            <strong className="mt-2 block text-5xl font-semibold text-stone-50">
              {sessions.filter((session) => session.recordingState === 'ready').length}
            </strong>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.45fr)]">
        <form className="glass-card p-7" onSubmit={handleCreateSession}>
          <div>
            <p className="eyebrow">Create Session</p>
            <h2 className="text-3xl font-semibold tracking-tight text-stone-50">
              New recording room
            </h2>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="eyebrow">Podcast Title</span>
              <input
                className="field mt-2"
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Example: Friday founder interview"
              />
            </label>

            <label className="block">
              <span className="eyebrow">Speaker 1 Label</span>
              <input
                className="field mt-2"
                type="text"
                value={form.hostLabel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, hostLabel: event.target.value }))
                }
              />
            </label>

            <label className="block">
              <span className="eyebrow">Speaker 2 Label</span>
              <input
                className="field mt-2"
                type="text"
                value={form.guestLabel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, guestLabel: event.target.value }))
                }
              />
            </label>
          </div>

          <button className="primary-btn mt-6 w-full" type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Create Recording Session'}
          </button>

          {message ? <p className="mt-4 text-sm text-stone-300">{message}</p> : null}
        </form>

        <div>
          <div className="mb-4">
            <p className="eyebrow">Monitor</p>
            <h2 className="text-3xl font-semibold tracking-tight text-stone-50">
              Your recording sessions
            </h2>
          </div>

          {sessions.length ? (
            <div className="grid gap-4">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          ) : (
            <div className="glass-card p-7">
              <h3 className="text-2xl font-semibold tracking-tight text-stone-50">
                No sessions yet
              </h3>
              <p className="mt-2 text-stone-300">
                Sabse pehle ek session create kariye. Invite links yahin generate ho
                jayenge.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default DashboardPage
