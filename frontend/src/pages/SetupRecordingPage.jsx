import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import SessionCard from '../components/SessionCard'
import ToastMessage from '../components/ToastMessage'
import UserBar from '../components/UserBar'
import { apiRequest, POLL_INTERVAL } from '../lib/podcast'

function SetupRecordingPage({ authToken, user, onLogout }) {
  // Regular users manage only the recording sessions they created.
  const [sessions, setSessions] = useState([])
  const [view, setView] = useState('create')
  const [activeSessionId, setActiveSessionId] = useState('')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [assignedScript, setAssignedScript] = useState(null)
  const [form, setForm] = useState({
    title: '',
    hostLabel: 'Speaker 1',
    guestLabel: 'Speaker 2',
  })

  const loadSessions = useEffectEvent(async () => {
    // Polling keeps invite/recording status fresh without a websocket dependency.
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

  useEffect(() => {
    let cancelled = false

    async function loadAssignedScript() {
      try {
        const payload = await apiRequest('/api/scripts/assigned', { authToken })
        if (cancelled || !payload.script) {
          return
        }

        setAssignedScript(payload.script)
        setForm((current) => ({
          ...current,
          title: payload.script.title || current.title,
          hostLabel: payload.script.speaker1Label || current.hostLabel,
          guestLabel: payload.script.speaker2Label || current.guestLabel,
        }))
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message)
        }
      }
    }

    void loadAssignedScript()

    return () => {
      cancelled = true
    }
  }, [authToken])

  async function handleCreateSession(event) {
    // Creating a session returns ready-to-share host, guest, and admin links.
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
      setActiveSessionId(session.id)
      setMessage('Recording room ready. Invite links have been generated.')
      setView('sessions')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCreating(false)
    }
  }

  const visibleSessions = activeSessionId
    ? sessions.filter((session) => session.id === activeSessionId)
    : []

  return (
    <main className="page-shell py-4 sm:py-8">
      <ToastMessage message={message} onClose={() => setMessage('')} />
      <UserBar user={user} onLogout={onLogout} />

      {view === 'create' ? (
        <form className="glass-card mx-auto max-w-2xl p-4 sm:p-7" onSubmit={handleCreateSession}>
          <div>
            <p className="eyebrow">Create Session</p>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-50 sm:text-3xl">
              Setup your recording room
            </h2>
            {assignedScript ? (
              <p className="mt-3 text-sm text-stone-300">
                Assigned work auto-filled for {user.mobile || user.email}.
              </p>
            ) : null}
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
                placeholder="Example: Weekly product catch-up"
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

        </form>
      ) : (
        <section>
          <div className="glass-card mb-4 p-4 sm:mb-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">My Sessions</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50 sm:text-3xl">
                  Your recording rooms
                </h2>
              </div>
              <button
                className="secondary-btn w-full sm:w-auto"
                type="button"
                onClick={() => {
                  setMessage('')
                  setView('create')
                }}
              >
                Create Another Session
              </button>
            </div>
          </div>

          {visibleSessions.length ? (
            <div className="grid gap-4">
              {visibleSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  showAdminView={false}
                  showCreated={false}
                  showHostInvite={false}
                  showHostJoin
                  showOwner={false}
                  showRecordings={false}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card p-7">
              <h3 className="text-2xl font-semibold tracking-tight text-stone-50">
                No recording room yet
              </h3>
              <p className="mt-2 text-stone-300">
                Create your first session, then the host and guest links will appear here.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default SetupRecordingPage
