import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import ToastMessage from '../components/ToastMessage'
import { apiRequest, POLL_INTERVAL } from '../lib/podcast'

const navItems = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Recording', value: 'recording' },
  { label: 'Users Management', value: 'users' },
  { label: 'Vendor Management', value: 'vendors' },
  { label: 'Script Upload', value: 'scripts' },
  { label: 'API Settings', value: 'api-settings' },
]

const ACTIVE_WINDOW_MS = 30 * 1000

function AdminPage({ authToken, user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [sessions, setSessions] = useState([])
  const [users, setUsers] = useState([])
  const [vendors, setVendors] = useState([])
  const [scripts, setScripts] = useState([])
  const [apiSettings, setApiSettings] = useState(null)
  const [systemStats, setSystemStats] = useState({ users: 0, vendors: 0 })
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('default')
  const [refreshing, setRefreshing] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [userModal, setUserModal] = useState(null)
  const [vendorModal, setVendorModal] = useState(null)
  const [scriptModal, setScriptModal] = useState(null)
  const [editingScriptId, setEditingScriptId] = useState('')
  const [recordingView, setRecordingView] = useState('live')
  const [profileModal, setProfileModal] = useState(false)
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false)
  const [selectedRecordingGroup, setSelectedRecordingGroup] = useState('')
  const [topbarVisible, setTopbarVisible] = useState(true)
  const [selectedScriptType, setSelectedScriptType] = useState(null)
  const [scriptTypeFilter, setScriptTypeFilter] = useState('all')
  const [pendingScriptModes, setPendingScriptModes] = useState({})
  const [vendorForm, setVendorForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '123456',
  })
  const [vendorBulkText, setVendorBulkText] = useState('')
  const [profileForm, setProfileForm] = useState({
    name: user.name || '',
    email: user.email || '',
    mobile: user.mobile || '',
  })
  const [scriptForm, setScriptForm] = useState({
    title: '',
    email: '',
    mobile: '',
    speaker1Label: 'Speaker 1',
    speaker2Label: 'Speaker 2',
    script: '',
  })
  const [apiForm, setApiForm] = useState({
    cloudName: '',
    apiKey: '',
    apiSecret: '',
  })
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '123456',
    role: 'user',
    vendorId: '',
    scriptMode: 'script',
  })
  const [bulkText, setBulkText] = useState('')
  const [scriptBulkText, setScriptBulkText] = useState('')

  const showToast = (nextMessage, tone = 'default') => {
    setMessage(nextMessage)
    setMessageTone(tone)
  }

  const stats = useMemo(() => {
    const live = sessions.filter((session) => session.recordingState === 'recording').length
    const complete = sessions.filter((session) => session.recordingState === 'ready').length
    const uploaded = sessions.reduce(
      (count, session) => count + Object.values(session.recordings || {}).filter(Boolean).length,
      0,
    )

    return { live, complete, uploaded }
  }, [sessions])

  const scriptTypeSummary = useMemo(() => {
    const script = users.filter((item) => item.role === 'user' && item.scriptMode !== 'non-script').length
    const nonScript = users.filter((item) => item.role === 'user' && item.scriptMode === 'non-script').length
    return { all: script + nonScript, script, nonScript }
  }, [users])

  const visibleUsers = useMemo(() => {
    if (scriptTypeFilter === 'script') {
      return users.filter((item) => item.role !== 'user' || item.scriptMode !== 'non-script')
    }

    if (scriptTypeFilter === 'non-script') {
      return users.filter((item) => item.role === 'user' && item.scriptMode === 'non-script')
    }

    return users
  }, [scriptTypeFilter, users])

  const liveSessions = useMemo(
    () => sessions.filter((session) => session.recordingState === 'recording'),
    [sessions],
  )

  const completedGroups = useMemo(() => {
    const groups = new Map()

    users.forEach((item) => {
      const key = getUserContactKey(item)
      if (!key) {
        return
      }
      groups.set(key, {
        key,
        title: 'No completed recording',
        ownerUserId: item.id || '-',
        ownerName: item.name || '-',
        ownerEmail: item.email || '',
        ownerMobile: item.mobile || '',
        contact: item.mobile || item.email || '-',
        sessions: [],
        totalRecordings: 0,
      })
    })

    sessions
      .filter((session) => Object.values(session.recordings || {}).some(Boolean))
      .forEach((session) => {
        const key = getSessionContactKey(session)
        const current = groups.get(key) || {
          key,
          title: session.title,
          ownerUserId: session.ownerUserId || '-',
          ownerName: session.ownerName || '-',
          ownerEmail: session.ownerEmail || '',
          ownerMobile: session.ownerMobile || '',
          contact: session.ownerMobile || session.ownerEmail || '-',
          sessions: [],
          totalRecordings: 0,
        }
        current.title = current.sessions.length ? current.title : session.title
        current.sessions.push(session)
        current.totalRecordings += Object.values(session.recordings || {}).filter(Boolean).length
        groups.set(key, current)
      })
    return [...groups.values()]
  }, [sessions, users])

  const activeCompletedGroup = useMemo(
    () =>
      completedGroups.find((group) => group.key === selectedRecordingGroup) ||
      completedGroups.find((group) => group.sessions.length) ||
      completedGroups[0],
    [completedGroups, selectedRecordingGroup],
  )

  const vendorNameById = useMemo(
    () =>
      vendors.reduce((lookup, vendor) => {
        lookup[vendor.id] = `${vendor.name} (${vendor.code})`
        return lookup
      }, {}),
    [vendors],
  )

  const scriptStatsByContact = useMemo(() => {
    const assignedCounts = new Map()
    scripts.forEach((script) => {
      const key = getScriptContactKey(script)
      if (!key) {
        return
      }
      assignedCounts.set(key, (assignedCounts.get(key) || 0) + 1)
    })

    const completedCounts = new Map()
    sessions
      .filter((session) => Object.values(session.recordings || {}).some(Boolean))
      .forEach((session) => {
        const key = getSessionContactKey(session)
        if (!key) {
          return
        }
        completedCounts.set(key, (completedCounts.get(key) || 0) + 1)
      })

    return users.reduce((lookup, item) => {
      if (item.scriptMode === 'non-script') {
        lookup[item.id] = { assigned: 0, pending: 0 }
        return lookup
      }

      const key = getUserContactKey(item)
      const assigned = assignedCounts.get(key) || 0
      const completed = completedCounts.get(key) || 0
      lookup[item.id] = {
        assigned,
        pending: Math.max(0, assigned - completed),
      }
      return lookup
    }, {})
  }, [scripts, sessions, users])

  const loadDashboard = useCallback(
    async ({ quiet = true } = {}) => {
      try {
        if (!quiet) {
          setRefreshing(true)
        }

        const [sessionData, userData, vendorData, scriptData, health, apiSettingsData] = await Promise.all([
          apiRequest('/api/sessions', { authToken }),
          apiRequest('/api/admin/users', { authToken }),
          apiRequest('/api/admin/vendors', { authToken }),
          apiRequest('/api/admin/scripts', { authToken }),
          apiRequest('/health'),
          apiRequest('/api/admin/settings', { authToken }),
        ])

        startTransition(() => {
          setSessions(sessionData)
          setUsers(
            userData.map((item) =>
              pendingScriptModes[item.id]
                ? { ...item, scriptMode: pendingScriptModes[item.id] }
                : item,
            ),
          )
          setVendors(vendorData)
          setScripts(scriptData)
          setApiSettings(apiSettingsData)
          setApiForm((current) => ({
            ...current,
            cloudName: current.cloudName || apiSettingsData.cloudName || '',
          }))
          setSystemStats({
            users: health.users || userData.length,
            vendors: health.vendors || vendorData.length,
          })
        })

        if (!quiet) {
          showToast('Admin data refreshed.')
        }
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        setRefreshing(false)
      }
    },
    [authToken, pendingScriptModes],
  )

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadDashboard()
    }, 0)
    const intervalId = window.setInterval(() => {
      void loadDashboard()
    }, POLL_INTERVAL)

    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [loadDashboard])

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timerId)
  }, [])

  async function handleCreateVendor(event) {
    event.preventDefault()
    try {
      const vendor = await apiRequest('/api/admin/vendors', {
        method: 'POST',
        authToken,
        body: JSON.stringify(vendorForm),
      })
      setVendors((current) => [vendor, ...current])
      setVendorForm({ name: '', email: '', mobile: '', password: '123456' })
      setVendorModal(null)
      showToast(`Vendor code ${vendor.code} was generated.`)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleBulkVendorCreate(event) {
    event.preventDefault()
    const rows = parseCsvRows(vendorBulkText, ['name', 'email', 'mobile', 'password'])

    try {
      const result = await apiRequest('/api/admin/vendors/bulk', {
        method: 'POST',
        authToken,
        body: JSON.stringify({ vendors: rows }),
      })
      setVendors((current) => [...result.created, ...current])
      setVendorBulkText('')
      setVendorModal(null)
      showToast(`${result.created.length} vendors were registered in bulk.`)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function handleVendorBulkFileUpload(event) {
    readTextFile(event.target.files?.[0], setVendorBulkText)
  }

  async function handleCreateUser(event) {
    event.preventDefault()
    try {
      const nextUser = await apiRequest('/api/admin/users', {
        method: 'POST',
        authToken,
        body: JSON.stringify(userForm),
      })
      setUsers((current) => [nextUser, ...current])
      setUserForm({
        name: '',
        email: '',
        mobile: '',
        password: '123456',
        role: 'user',
        vendorId: '',
        scriptMode: 'script',
      })
      setUserModal(null)
      showToast('User registered.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleBulkCreate(event) {
    event.preventDefault()
    const rows = parseCsvRows(bulkText, [
      'name',
      'email',
      'mobile',
      'password',
      'vendorId',
      'scriptMode',
    ]).map((row) => ({ ...row, password: row.password || '123456', role: 'user' }))

    try {
      const result = await apiRequest('/api/admin/users/bulk', {
        method: 'POST',
        authToken,
        body: JSON.stringify({ users: rows }),
      })
      setUsers((current) => [...result.created, ...current])
      setBulkText('')
      setUserModal(null)
      showToast(`${result.created.length} users were registered in bulk.`)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function handleBulkFileUpload(event) {
    readTextFile(event.target.files?.[0], setBulkText)
  }

  async function handleUpdateUser(userId, patch) {
    try {
      const nextUser = await apiRequest(`/api/admin/users/${userId}`, {
        method: 'POST',
        authToken,
        body: JSON.stringify(patch),
      })
      setUsers((current) => current.map((item) => (item.id === userId ? nextUser : item)))
      showToast('User updated.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleUpdateUserScriptType(userId, scriptMode) {
    const currentUser = users.find((item) => item.id === userId)
    const previousScriptMode = currentUser?.scriptMode || 'script'
    setSelectedScriptType({
      name: currentUser?.name || currentUser?.mobile || userId,
      mode: scriptMode === 'non-script' ? 'Non Script' : 'Script',
    })

    setUsers((current) =>
      current.map((item) => (item.id === userId ? { ...item, scriptMode } : item)),
    )
    setPendingScriptModes((current) => ({ ...current, [userId]: scriptMode }))

    try {
      const nextUser = await apiRequest(`/api/admin/users/${userId}`, {
        method: 'POST',
        authToken,
        body: JSON.stringify({ scriptMode }),
      })
      const savedUser = { ...nextUser, scriptMode: nextUser.scriptMode || scriptMode }
      setUsers((current) => current.map((item) => (item.id === userId ? savedUser : item)))
      if (nextUser.scriptMode === scriptMode) {
        setPendingScriptModes((current) => {
          const nextPending = { ...current }
          delete nextPending[userId]
          return nextPending
        })
        showToast('Script type updated.')
      } else {
        showToast('Script type changed in the UI. Restart or deploy the backend to save it permanently.', 'error')
      }
    } catch (error) {
      setUsers((current) =>
        current.map((item) =>
          item.id === userId ? { ...item, scriptMode: previousScriptMode } : item,
        ),
      )
      setPendingScriptModes((current) => {
        const nextPending = { ...current }
        delete nextPending[userId]
        return nextPending
      })
      setSelectedScriptType(null)
      showToast(error.message, 'error')
    }
  }

  async function handleDeleteUser(userId) {
    try {
      await apiRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        authToken,
      })
      setUsers((current) => current.filter((item) => item.id !== userId))
      showToast('User deleted.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleUpdateVendor(vendorId, patch) {
    try {
      const vendor = await apiRequest(`/api/admin/vendors/${vendorId}`, {
        method: 'POST',
        authToken,
        body: JSON.stringify(patch),
      })
      setVendors((current) => current.map((item) => (item.id === vendorId ? vendor : item)))
      showToast('Vendor updated.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleDeleteVendor(vendorId) {
    try {
      await apiRequest(`/api/admin/vendors/${vendorId}`, {
        method: 'DELETE',
        authToken,
      })
      setVendors((current) => current.filter((item) => item.id !== vendorId))
      showToast('Vendor deleted.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault()
    try {
      await apiRequest('/api/auth/profile', {
        method: 'POST',
        authToken,
        body: JSON.stringify(profileForm),
      })
      setProfileModal(false)
      showToast('Profile saved. The header name will update after refresh.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleCreateScript(event) {
    event.preventDefault()
    try {
      const script = await apiRequest('/api/admin/scripts', {
        method: 'POST',
        authToken,
        body: JSON.stringify(scriptForm),
      })
      setScripts((current) => [script, ...current])
      setScriptForm({
        title: '',
        email: '',
        mobile: '',
        speaker1Label: 'Speaker 1',
        speaker2Label: 'Speaker 2',
        script: '',
      })
      setScriptModal(null)
      showToast('Script assigned.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleUpdateScript(event) {
    event.preventDefault()
    try {
      const script = await apiRequest(`/api/admin/scripts/${editingScriptId}`, {
        method: 'POST',
        authToken,
        body: JSON.stringify(scriptForm),
      })
      setScripts((current) => current.map((item) => (item.id === script.id ? script : item)))
      resetScriptForm()
      setScriptModal(null)
      setEditingScriptId('')
      showToast('Script updated.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleDeleteScript(scriptId) {
    try {
      await apiRequest(`/api/admin/scripts/${scriptId}`, {
        method: 'DELETE',
        authToken,
      })
      setScripts((current) => current.filter((item) => item.id !== scriptId))
      showToast('Script deleted.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function openEditScript(script) {
    setEditingScriptId(script.id)
    setScriptForm({
      title: script.title || '',
      email: script.email || '',
      mobile: script.mobile || '',
      speaker1Label: script.speaker1Label || 'Speaker 1',
      speaker2Label: script.speaker2Label || 'Speaker 2',
      script: script.script || '',
    })
    setScriptModal('edit')
  }

  function openNewScriptModal() {
    setEditingScriptId('')
    resetScriptForm()
    setScriptModal('single')
  }

  function resetScriptForm() {
    setScriptForm({
      title: '',
      email: '',
      mobile: '',
      speaker1Label: 'Speaker 1',
      speaker2Label: 'Speaker 2',
      script: '',
    })
  }

  async function handleBulkScriptCreate(event) {
    event.preventDefault()
    const rows = parseCsvRows(scriptBulkText, [
      'title',
      'email',
      'mobile',
      'speaker1Label',
      'speaker2Label',
      'script',
    ])
    try {
      const result = await apiRequest('/api/admin/scripts/bulk', {
        method: 'POST',
        authToken,
        body: JSON.stringify({ scripts: rows }),
      })
      setScripts((current) => [...result.created, ...current])
      setScriptBulkText('')
      setScriptModal(null)
      showToast(`${result.created.length} scripts were assigned in bulk.`)
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function handleScriptBulkFileUpload(event) {
    readTextFile(event.target.files?.[0], setScriptBulkText)
  }

  async function handleDeleteRecording(sessionId, track) {
    try {
      const result = await apiRequest(`/api/admin/sessions/${sessionId}/recordings/${track}`, {
        method: 'DELETE',
        authToken,
      })
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? result.session : session)),
      )
      showToast('Recording deleted.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  async function handleSaveApiSettings(event) {
    event.preventDefault()
    try {
      const settings = await apiRequest('/api/admin/settings', {
        method: 'POST',
        authToken,
        body: JSON.stringify(apiForm),
      })
      setApiSettings(settings)
      setApiForm({
        cloudName: settings.cloudName || '',
        apiKey: '',
        apiSecret: '',
      })
      showToast('API settings saved to the backend.')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function renderDashboard() {
    return (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Users Registered" value={systemStats.users} />
        <StatCard label="Live Recording" value={stats.live} />
        <StatCard label="Recording Complete" value={stats.complete} />
        <StatCard label="Recording Uploaded" value={stats.uploaded} />
        <StatCard label="Vendor Registered" value={systemStats.vendors} />
      </section>
    )
  }

  function renderUsers() {
    return (
      <section className="grid gap-5">
        <div className="glass-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">Users Management</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
                Users table
              </h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="primary-btn" type="button" onClick={() => setUserModal('single')}>
                Register User
              </button>
              <button className="secondary-btn" type="button" onClick={() => setUserModal('bulk')}>
                Bulk User Register
              </button>
            </div>
          </div>
        </div>
        <UsersManagementTable
          onDeleteUser={handleDeleteUser}
          onOpenRecordings={(item) => {
            setSelectedRecordingGroup(getUserContactKey(item))
            setRecordingView('completed')
            setActiveTab('recording')
          }}
          onScriptTypeChange={handleUpdateUserScriptType}
          onUpdateUser={handleUpdateUser}
          pendingScriptModes={pendingScriptModes}
          scriptStatsByUserId={scriptStatsByContact}
          users={visibleUsers}
          vendorNameById={vendorNameById}
          vendors={vendors}
        />
        {userModal ? (
          <UserRegisterModal
            bulkText={bulkText}
            form={userForm}
            mode={userModal}
            onBulkFileUpload={handleBulkFileUpload}
            onBulkSubmit={handleBulkCreate}
            onClose={() => setUserModal(null)}
            onSingleSubmit={handleCreateUser}
            setBulkText={setBulkText}
            setForm={setUserForm}
            vendors={vendors}
          />
        ) : null}
      </section>
    )
  }

  function renderRecording() {
    return (
      <section className="grid gap-6">
        <div className="glass-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">Recording</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
                Live and completed recordings
              </h2>
            </div>
            <div className="flex rounded-full bg-white/8 p-1">
              {[
                ['live', 'Live Recording'],
                ['completed', 'Completed Recording'],
              ].map(([value, label]) => (
                <button
                  className={recordingView === value ? 'tab-btn-active' : 'tab-btn'}
                  key={value}
                  type="button"
                  onClick={() => setRecordingView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {recordingView === 'live' ? (
          <div className="glass-card p-6">
            <p className="eyebrow">Live Recording</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
              Active rooms
            </h2>

            {liveSessions.length ? (
              <div className="mt-5 grid gap-4">
                {liveSessions.map((session) => (
                  <div className="info-card" key={session.id}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <strong className="block text-lg font-semibold text-stone-50">
                          {session.title}
                        </strong>
                        <span className="text-sm text-stone-300">ID {session.id}</span>
                      </div>
                      <span className="text-sm text-amber-200">Recording live</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {['host', 'guest'].map((role) => (
                        <ParticipantActivity
                          key={role}
                          nowMs={nowMs}
                          participant={session.participants[role]}
                          title={role === 'host' ? 'Speaker 1' : 'Speaker 2'}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex min-h-28 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-8 text-center">
                <div>
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-300/10 ring-1 ring-emerald-300/25">
                    <span className="size-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-stone-50">
                    No live recording active
                  </h3>
                  <p className="mt-2 text-sm text-stone-300">
                    When a room starts recording, its live status will appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <CompletedRecordingPanel
            activeGroup={activeCompletedGroup}
            groups={completedGroups}
            onDeleteRecording={handleDeleteRecording}
            selectedGroupKey={activeCompletedGroup?.key || ''}
            setSelectedGroup={setSelectedRecordingGroup}
          />
        )}
      </section>
    )
  }

  function renderVendors() {
    return (
      <section className="grid gap-5">
        <div className="glass-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">Vendor Management</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
                Vendor table
              </h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="primary-btn"
                type="button"
                onClick={() => setVendorModal('single')}
              >
                Register Vendor
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setVendorModal('bulk')}
              >
                Bulk Vendor Register
              </button>
            </div>
          </div>
        </div>

        <VendorManagementTable
          onDeleteVendor={handleDeleteVendor}
          onUpdateVendor={handleUpdateVendor}
          vendors={vendors}
        />

        {vendorModal ? (
          <VendorRegisterModal
            bulkText={vendorBulkText}
            form={vendorForm}
            mode={vendorModal}
            onBulkFileUpload={handleVendorBulkFileUpload}
            onBulkSubmit={handleBulkVendorCreate}
            onClose={() => setVendorModal(null)}
            onSingleSubmit={handleCreateVendor}
            setBulkText={setVendorBulkText}
            setForm={setVendorForm}
          />
        ) : null}
      </section>
    )
  }

  function renderScripts() {
    return (
      <section className="grid gap-5">
        <div className="glass-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">Script Upload</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
                Assign scripts
              </h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="primary-btn"
                type="button"
                onClick={openNewScriptModal}
              >
                Single Script
              </button>
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setScriptModal('bulk')}
              >
                Bulk Script
              </button>
            </div>
          </div>
        </div>
        <ScriptsManagementTable
          onDeleteScript={handleDeleteScript}
          onEditScript={openEditScript}
          onUpdateUserVendor={handleUpdateUser}
          scripts={scripts}
          users={users}
          vendorNameById={vendorNameById}
          vendors={vendors}
        />

        {scriptModal ? (
          <ScriptAssignModal
            bulkText={scriptBulkText}
            form={scriptForm}
            mode={scriptModal}
            onBulkFileUpload={handleScriptBulkFileUpload}
            onBulkSubmit={handleBulkScriptCreate}
            onClose={() => {
              setScriptModal(null)
              setEditingScriptId('')
            }}
            onSingleSubmit={scriptModal === 'edit' ? handleUpdateScript : handleCreateScript}
            setBulkText={setScriptBulkText}
            setForm={setScriptForm}
          />
        ) : null}
      </section>
    )
  }

  function renderApiSettings() {
    return (
      <section className="grid gap-5">
        <div className="glass-card p-5">
          <p className="eyebrow">Backend Settings</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
            API Settings
          </h2>
          <p className="mt-2 text-sm text-stone-300">
            Save your Cloudinary API details here so the backend can upload recordings.
          </p>
        </div>

        <form className="glass-card max-w-2xl p-6" onSubmit={handleSaveApiSettings}>
          <div className="grid gap-4">
            <InputField
              label="Cloud Name"
              value={apiForm.cloudName}
              onChange={(value) => setApiForm((current) => ({ ...current, cloudName: value }))}
            />
            <InputField
              label="API Key"
              value={apiForm.apiKey}
              onChange={(value) => setApiForm((current) => ({ ...current, apiKey: value }))}
              placeholder={apiSettings?.apiKey ? `Current: ${apiSettings.apiKey}` : 'Enter API key'}
            />
            <InputField
              label="API Secret"
              type="password"
              value={apiForm.apiSecret}
              onChange={(value) => setApiForm((current) => ({ ...current, apiSecret: value }))}
              placeholder={apiSettings?.apiSecret ? `Current: ${apiSettings.apiSecret}` : 'Enter API secret'}
            />
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-stone-300">
              Status: {apiSettings?.configured ? 'Configured' : 'Not configured'}
            </span>
            <button className="primary-btn" type="submit">
              Save API Settings
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <main className="mx-auto w-full max-w-none px-4 py-6 sm:px-6">
      <ToastMessage message={message} tone={messageTone} onClose={() => setMessage('')} />
      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="glass-card p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
          <div className="rounded-2xl bg-white/8 p-4">
            <p className="eyebrow">Admin</p>
            <strong className="mt-2 block text-xl font-semibold text-stone-50">DualRecord</strong>
          </div>
          <nav className="mt-4 grid gap-2">
            {navItems.map((item) => (
              <button
                className={
                  activeTab === item.value
                    ? 'tab-btn-active justify-start'
                    : 'ghost-btn justify-start rounded-2xl'
                }
                key={item.value}
                type="button"
                onClick={() => setActiveTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {topbarVisible ? (
            <header className="glass-card relative z-50 overflow-visible p-5">
              <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <p className="eyebrow">Admin Dashboard</p>
                  <div className="mt-2 flex min-w-0 flex-wrap gap-2 text-xs font-semibold text-stone-200">
                    <button
                      className={
                        scriptTypeFilter === 'all'
                          ? 'max-w-full truncate rounded-full bg-amber-300/20 px-3 py-1 text-amber-100'
                          : 'max-w-full truncate rounded-full bg-white/8 px-3 py-1 transition hover:bg-white/12'
                      }
                      type="button"
                      onClick={() => {
                        setScriptTypeFilter('all')
                        setActiveTab('users')
                      }}
                    >
                      All: {scriptTypeSummary.all}
                    </button>
                    <button
                      className={
                        scriptTypeFilter === 'script'
                          ? 'max-w-full truncate rounded-full bg-amber-300/20 px-3 py-1 text-amber-100'
                          : 'max-w-full truncate rounded-full bg-white/8 px-3 py-1 transition hover:bg-white/12'
                      }
                      type="button"
                      onClick={() => {
                        setScriptTypeFilter('script')
                        setActiveTab('users')
                      }}
                    >
                      Script: {scriptTypeSummary.script}
                    </button>
                    <button
                      className={
                        scriptTypeFilter === 'non-script'
                          ? 'max-w-full truncate rounded-full bg-amber-300/20 px-3 py-1 text-amber-100'
                          : 'max-w-full truncate rounded-full bg-white/8 px-3 py-1 transition hover:bg-white/12'
                      }
                      type="button"
                      onClick={() => {
                        setScriptTypeFilter('non-script')
                        setActiveTab('users')
                      }}
                    >
                      Non Script: {scriptTypeSummary.nonScript}
                    </button>
                    {selectedScriptType ? (
                      <span className="max-w-full truncate rounded-full bg-amber-300/15 px-3 py-1 text-amber-100">
                        Selected: {selectedScriptType.name} - {selectedScriptType.mode}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap gap-3 sm:items-center xl:justify-end">
                  <button
                    className="secondary-btn shrink-0"
                    type="button"
                    onClick={() => loadDashboard({ quiet: false })}
                    disabled={refreshing}
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button
                    className="secondary-btn shrink-0"
                    type="button"
                    onClick={() => setTopbarVisible(false)}
                  >
                    Hide Topbar
                  </button>
                  <div className="relative min-w-0">
                    <button
                      className="flex min-w-0 max-w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-left transition hover:bg-white/10 sm:min-w-36"
                      type="button"
                      onClick={() => setAdminDropdownOpen((current) => !current)}
                    >
                      <span className="min-w-0">
                        <span className="eyebrow block">Admin</span>
                        <strong className="block truncate text-sm font-semibold text-stone-50">
                          {user.name}
                        </strong>
                      </span>
                      <span className="shrink-0 text-xs text-stone-300">
                        {adminDropdownOpen ? 'Up' : 'Down'}
                      </span>
                    </button>
                    {adminDropdownOpen ? (
                      <div className="absolute right-0 top-full z-[100] mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
                        <button
                          className="flex w-full items-center justify-start rounded-xl px-4 py-3 text-left text-sm font-semibold text-stone-100 transition hover:bg-white/10"
                          type="button"
                          onClick={() => {
                            setAdminDropdownOpen(false)
                            setProfileModal(true)
                          }}
                        >
                          Edit Profile
                        </button>
                        <button
                          className="flex w-full items-center justify-start rounded-xl px-4 py-3 text-left text-sm font-semibold text-rose-200 transition hover:bg-rose-400/15"
                          type="button"
                          onClick={() => {
                            setAdminDropdownOpen(false)
                            onLogout()
                          }}
                        >
                          Logout
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>
          ) : (
            <div className="glass-card flex min-w-0 items-center justify-between gap-3 p-3">
              <span className="min-w-0 truncate text-sm font-semibold text-stone-100">
                Topbar hidden
              </span>
              <button
                className="secondary-btn shrink-0 px-4 py-2"
                type="button"
                onClick={() => setTopbarVisible(true)}
              >
                Unhide Topbar
              </button>
            </div>
          )}

          <div className="mt-6">
            {activeTab === 'dashboard' ? renderDashboard() : null}
            {activeTab === 'recording' ? renderRecording() : null}
            {activeTab === 'users' ? renderUsers() : null}
            {activeTab === 'vendors' ? renderVendors() : null}
            {activeTab === 'scripts' ? renderScripts() : null}
            {activeTab === 'api-settings' ? renderApiSettings() : null}
          </div>
        </div>
      </div>

      {profileModal ? (
        <ProfileModal
          form={profileForm}
          onClose={() => setProfileModal(false)}
          onSubmit={handleSaveProfile}
          setForm={setProfileForm}
        />
      ) : null}
    </main>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="info-card">
      <span className="eyebrow">{label}</span>
      <strong className="mt-2 block text-4xl font-semibold text-stone-50">{value}</strong>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        className="field mt-2"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ProfileModal({ form, onClose, onSubmit, setForm }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <form className="glass-card w-full max-w-lg p-6" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Admin Profile</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
              Edit profile
            </h2>
          </div>
          <button className="ghost-btn px-4 py-2" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          {['name', 'email', 'mobile'].map((key) => (
            <InputField
              key={key}
              label={key === 'mobile' ? 'Mobile' : key.charAt(0).toUpperCase() + key.slice(1)}
              type={key === 'email' ? 'email' : 'text'}
              value={form[key]}
              onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
            />
          ))}
        </div>
        <button className="primary-btn mt-5 w-full" type="submit">
          Save Profile
        </button>
      </form>
    </div>
  )
}

function UserFormFields({ form, setForm, vendors }) {
  return (
    <div className="mt-5 grid gap-4">
      {['name', 'email', 'mobile', 'password'].map((key) => (
        <InputField
          key={key}
          label={key === 'mobile' ? 'Mobile' : key.charAt(0).toUpperCase() + key.slice(1)}
          type={key === 'email' ? 'email' : key === 'password' ? 'password' : 'text'}
          value={form[key]}
          onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
        />
      ))}
      <label className="block">
        <span className="eyebrow">Vendor</span>
        <select
          className="field mt-2"
          value={form.vendorId}
          onChange={(event) => setForm((current) => ({ ...current, vendorId: event.target.value }))}
        >
          <option value="">No vendor</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name} ({vendor.code})
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow">Script Type</span>
        <select
          className="field mt-2"
          value={form.scriptMode || 'script'}
          onChange={(event) =>
            setForm((current) => ({ ...current, scriptMode: event.target.value }))
          }
        >
          <option value="script">Script</option>
          <option value="non-script">Non Script</option>
        </select>
      </label>
    </div>
  )
}

function UserRegisterModal({
  bulkText,
  form,
  mode,
  onBulkFileUpload,
  onBulkSubmit,
  onClose,
  onSingleSubmit,
  setBulkText,
  setForm,
  vendors,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className="glass-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <ModalHeader
          eyebrow={mode === 'single' ? 'Register User' : 'Bulk User Register'}
          title={mode === 'single' ? 'Create user account' : 'Upload Excel / Google Sheet CSV'}
          onClose={onClose}
        />

        {mode === 'single' ? (
          <form className="mt-6" onSubmit={onSingleSubmit}>
            <UserFormFields form={form} setForm={setForm} vendors={vendors} />
            <button className="primary-btn mt-5 w-full" type="submit">
              Register User
            </button>
          </form>
        ) : (
          <BulkTextForm
            accept=".csv,.txt"
            buttonLabel="Bulk Register Users"
            onFileUpload={onBulkFileUpload}
            onSubmit={onBulkSubmit}
            placeholder="name,email,mobile,password,vendorId,scriptMode"
            text={bulkText}
            setText={setBulkText}
          />
        )}
      </div>
    </div>
  )
}

function VendorRegisterModal({
  bulkText,
  form,
  mode,
  onBulkFileUpload,
  onBulkSubmit,
  onClose,
  onSingleSubmit,
  setBulkText,
  setForm,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className="glass-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <ModalHeader
          eyebrow={mode === 'single' ? 'Register Vendor' : 'Bulk Vendor Register'}
          title={mode === 'single' ? 'Create vendor account' : 'Upload Excel / Google Sheet CSV'}
          onClose={onClose}
        />

        {mode === 'single' ? (
          <form className="mt-6" onSubmit={onSingleSubmit}>
            <div className="grid gap-4">
              {['name', 'email', 'mobile', 'password'].map((key) => (
                <InputField
                  key={key}
                  label={key === 'mobile' ? 'Mobile' : key.charAt(0).toUpperCase() + key.slice(1)}
                  type={key === 'email' ? 'email' : key === 'password' ? 'password' : 'text'}
                  value={form[key]}
                  onChange={(value) => setForm((current) => ({ ...current, [key]: value }))}
                />
              ))}
            </div>
            <button className="primary-btn mt-5 w-full" type="submit">
              Register Vendor
            </button>
          </form>
        ) : (
          <BulkTextForm
            accept=".csv,.txt"
            buttonLabel="Bulk Register Vendors"
            onFileUpload={onBulkFileUpload}
            onSubmit={onBulkSubmit}
            placeholder="name,email,mobile,password"
            text={bulkText}
            setText={setBulkText}
          />
        )}
      </div>
    </div>
  )
}

function ScriptAssignModal({
  bulkText,
  form,
  mode,
  onBulkFileUpload,
  onBulkSubmit,
  onClose,
  onSingleSubmit,
  setBulkText,
  setForm,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <div className="glass-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <ModalHeader
          eyebrow={mode === 'bulk' ? 'Bulk Script' : mode === 'edit' ? 'Edit Script' : 'Single Script'}
          title={mode === 'bulk' ? 'Upload Excel / Google Sheet CSV' : mode === 'edit' ? 'Update assigned script' : 'Assign script to user'}
          onClose={onClose}
        />

        {mode !== 'bulk' ? (
          <form className="mt-6" onSubmit={onSingleSubmit}>
            <div className="grid gap-4">
              <InputField
                label="Title"
                value={form.title}
                onChange={(value) => setForm((current) => ({ ...current, title: value }))}
              />
              <InputField
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => setForm((current) => ({ ...current, email: value }))}
              />
              <InputField
                label="Mobile"
                value={form.mobile}
                onChange={(value) => setForm((current) => ({ ...current, mobile: value }))}
              />
              <InputField
                label="Speaker 1 Label"
                value={form.speaker1Label}
                onChange={(value) =>
                  setForm((current) => ({ ...current, speaker1Label: value }))
                }
              />
              <InputField
                label="Speaker 2 Label"
                value={form.speaker2Label}
                onChange={(value) =>
                  setForm((current) => ({ ...current, speaker2Label: value }))
                }
              />
              <label className="block">
                <span className="eyebrow">Script</span>
                <textarea
                  className="field mt-2 min-h-40"
                  value={form.script}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, script: event.target.value }))
                  }
                />
              </label>
            </div>
            <button className="primary-btn mt-5 w-full" type="submit">
              {mode === 'edit' ? 'Save Script' : 'Assign Script'}
            </button>
          </form>
        ) : (
          <BulkTextForm
            accept=".csv,.txt"
            buttonLabel="Bulk Assign Scripts"
            onFileUpload={onBulkFileUpload}
            onSubmit={onBulkSubmit}
            placeholder="title,email,mobile,speaker1Label,speaker2Label,script"
            text={bulkText}
            setText={setBulkText}
          />
        )}
      </div>
    </div>
  )
}

function ModalHeader({ eyebrow, title, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">{title}</h2>
      </div>
      <button className="ghost-btn px-4 py-2" type="button" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

function BulkTextForm({ accept, buttonLabel, onFileUpload, onSubmit, placeholder, text, setText }) {
  return (
    <form className="mt-6" onSubmit={onSubmit}>
      <label className="block">
        <span className="eyebrow">CSV file</span>
        <input accept={accept} className="field mt-2" type="file" onChange={onFileUpload} />
      </label>
      <textarea
        className="field mt-4 min-h-48"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
      />
      <button className="primary-btn mt-5 w-full" type="submit">
        {buttonLabel}
      </button>
    </form>
  )
}

function ScriptsManagementTable({
  onDeleteScript,
  onEditScript,
  onUpdateUserVendor,
  scripts,
  users,
  vendorNameById,
  vendors,
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <p className="eyebrow">Assigned scripts ({scripts.length})</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1240px] text-left text-sm text-stone-200">
          <thead className="bg-white/6 text-xs uppercase tracking-[0.18em] text-stone-300">
            <tr>
              {[
                'Title',
                'Email',
                'Mobile',
                'Vendor User',
                'Vendor',
                'Speaker 1',
                'Speaker 2',
                'Script',
                'Action',
              ].map((column) => (
                  <th className="px-4 py-3 font-semibold" key={column}>
                    {column}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {scripts.length ? (
              scripts.map((item) => {
                const assignedUser = users.find(
                  (user) => getUserContactKey(user) && getUserContactKey(user) === getScriptContactKey(item),
                )

                return (
                  <tr className="border-t border-white/10" key={item.id}>
                    <td className="px-4 py-3 font-semibold text-stone-50">{item.title}</td>
                    <td className="px-4 py-3">{item.email || '-'}</td>
                    <td className="px-4 py-3">{item.mobile || '-'}</td>
                    <td className="px-4 py-3">{assignedUser?.name || '-'}</td>
                    <td className="px-4 py-3">
                      {assignedUser ? (
                        <select
                          className="field min-w-52 py-2"
                          value={assignedUser.vendorId || ''}
                          onChange={(event) =>
                            onUpdateUserVendor(assignedUser.id, { vendorId: event.target.value })
                          }
                        >
                          <option value="">Not assigned</option>
                          {vendors.map((vendor) => (
                            <option key={vendor.id} value={vendor.id}>
                              {vendorNameById[vendor.id]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">{item.speaker1Label || 'Speaker 1'}</td>
                    <td className="px-4 py-3">{item.speaker2Label || 'Speaker 2'}</td>
                    <td className="px-4 py-3">{truncateText(item.script, 90)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="secondary-btn py-2"
                          type="button"
                          onClick={() => onEditScript(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger-btn py-2"
                          type="button"
                          onClick={() => onDeleteScript(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr className="border-t border-white/10">
                <td className="px-4 py-4 text-stone-300" colSpan={9}>
                  No scripts assigned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompletedRecordingPanel({
  activeGroup,
  groups,
  onDeleteRecording,
  selectedGroupKey,
  setSelectedGroup,
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.45fr)_minmax(0,1fr)]">
      <div className="glass-card p-5">
        <p className="eyebrow">Completed Recording</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
          User boxes
        </h2>
        <div className="mt-5 grid gap-3">
          {groups.length ? (
            groups.map((group) => (
              <button
                className={
                  selectedGroupKey === group.key
                    ? 'info-card border-amber-300/50 text-left'
                    : 'info-card text-left'
                }
                key={group.key}
                type="button"
                onClick={() => setSelectedGroup(group.key)}
              >
                <strong className="block text-sm font-semibold text-stone-50">
                  {group.ownerName}
                </strong>
                <span className="mt-1 block text-xs text-stone-300">
                  {group.ownerUserId} | {group.totalRecordings} recordings
                </span>
                <span className="mt-1 block truncate text-xs text-stone-300">
                  {group.contact}
                </span>
              </button>
            ))
          ) : (
            <p className="text-sm text-stone-300">No completed or uploaded recordings are available yet.</p>
          )}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <p className="eyebrow">Recording list</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
            {activeGroup?.contact || 'No completed recording'}
          </h2>
          {activeGroup ? (
            <p className="mt-2 text-sm text-stone-300">
              User ID {activeGroup.ownerUserId} | {activeGroup.ownerName} |{' '}
              {activeGroup.ownerMobile || activeGroup.ownerEmail || '-'}
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm text-stone-200">
            <thead className="bg-white/6 text-xs uppercase tracking-[0.18em] text-stone-300">
              <tr>
                {[
                  'Title',
                  'User ID',
                  'Name',
                  'Mobile / Email',
                  'Speaker 1',
                  'Speaker 2',
                  'Combined',
                  'Duration',
                  'Action',
                ].map((column) => (
                  <th className="px-4 py-3 font-semibold" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeGroup?.sessions?.length ? (
                activeGroup.sessions.map((session) => (
                  <tr className="border-t border-white/10" key={session.id}>
                    <td className="px-4 py-3 font-semibold text-stone-50">{session.title}</td>
                    <td className="px-4 py-3">{session.ownerUserId}</td>
                    <td className="px-4 py-3">{session.ownerName || '-'}</td>
                    <td className="px-4 py-3">{session.ownerMobile || session.ownerEmail || '-'}</td>
                    {['host', 'guest', 'mixed'].map((track) => (
                      <td className="px-4 py-3" key={track}>
                        {session.recordings?.[track] ? (
                          <a
                            className="secondary-btn py-2 text-center"
                            download={buildWavFileName(session, track)}
                            href={buildWavDownloadUrl(session.recordings[track], session, track)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                        ) : (
                          'Pending'
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      {formatDuration(
                        session.participants?.host?.joinedAt,
                        session.participants?.host?.lastSeenAt,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {['host', 'guest', 'mixed']
                          .filter((track) => session.recordings?.[track])
                          .map((track) => (
                            <button
                              className="danger-btn py-2"
                              key={track}
                              type="button"
                              onClick={() => onDeleteRecording(session.id, track)}
                            >
                              Delete {track}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="border-t border-white/10">
                  <td className="px-4 py-4 text-stone-300" colSpan={9}>
                    No completed recording selected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ParticipantActivity({ nowMs, participant, title }) {
  const lastSeenAt = participant?.lastSeenAt
  const isActive = Boolean(lastSeenAt) && nowMs - new Date(lastSeenAt).getTime() <= ACTIVE_WINDOW_MS

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <span className="eyebrow">{title}</span>
      <strong className="mt-2 block text-sm font-semibold text-stone-50">
        {participant?.label || 'Not joined'}
      </strong>
      <div className="mt-3 grid gap-2 text-sm text-stone-300">
        <span>Status: {isActive ? 'Active' : 'Inactive'}</span>
        <span>Last active: {formatDateTime(lastSeenAt)}</span>
        <span>Active duration: {formatDuration(participant?.joinedAt, participant?.lastSeenAt)}</span>
      </div>
    </div>
  )
}

function UsersManagementTable({
  onDeleteUser,
  onOpenRecordings,
  onScriptTypeChange,
  onUpdateUser,
  pendingScriptModes,
  scriptStatsByUserId,
  users,
  vendorNameById,
  vendors,
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <p className="eyebrow">Users table</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] text-left text-sm text-stone-200">
          <thead className="bg-white/6 text-xs uppercase tracking-[0.18em] text-stone-300">
            <tr>
              {[
                'Name',
                'Email',
                'Mobile',
                'Assigned Scripts',
                'Pending Scripts',
                'Script Type',
                'Status',
                'Vendor Code',
                'Vendor',
                'Action',
              ].map(
                (column) => (
                  <th className="px-4 py-3 font-semibold" key={column}>
                    {column}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((item) => {
              const isSuspended = item.status === 'suspended'
              const scriptStats = scriptStatsByUserId[item.id] || { assigned: 0, pending: 0 }
              const isAdminUser = item.role === 'admin'
              return (
                <tr className="border-t border-white/10" key={item.id}>
                  <td className="px-4 py-3 font-semibold text-stone-50">{item.name}</td>
                  <td className="px-4 py-3">{item.email}</td>
                  <td className="px-4 py-3">
                    <button
                      className="text-left font-semibold text-amber-200 underline decoration-amber-200/40 underline-offset-4"
                      type="button"
                      onClick={() => onOpenRecordings(item)}
                    >
                      {item.mobile || item.email || '-'}
                    </button>
                  </td>
                  <td className="px-4 py-3">{scriptStats.assigned}</td>
                  <td className="px-4 py-3">{scriptStats.pending}</td>
                  <td className="px-4 py-3">
                    {isAdminUser ? (
                      <span className="text-stone-400">-</span>
                    ) : (
                      <select
                        className="field min-w-40 py-2"
                        value={pendingScriptModes[item.id] || item.scriptMode || 'script'}
                        onChange={(event) =>
                          onScriptTypeChange(item.id, event.target.value)
                        }
                      >
                        <option value="script">Script</option>
                        <option value="non-script">Non Script</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">{item.vendorCode || '-'}</td>
                  <td className="px-4 py-3">
                    {isAdminUser ? (
                      <span className="text-stone-400">-</span>
                    ) : (
                      <select
                        className="field min-w-52 py-2"
                        value={item.vendorId || ''}
                        onChange={(event) => onUpdateUser(item.id, { vendorId: event.target.value })}
                      >
                        <option value="">Not assigned</option>
                        {vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendorNameById[vendor.id]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={isSuspended ? 'secondary-btn py-2' : 'danger-btn py-2'}
                        type="button"
                        onClick={() =>
                          onUpdateUser(item.id, { status: isSuspended ? 'active' : 'suspended' })
                        }
                      >
                        {isSuspended ? 'Activate' : 'Suspend'}
                      </button>
                      <button
                        className="danger-btn py-2"
                        type="button"
                        onClick={() => onDeleteUser(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VendorManagementTable({ onDeleteVendor, onUpdateVendor, vendors }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <p className="eyebrow">Vendor table ({vendors.length})</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm text-stone-200">
          <thead className="bg-white/6 text-xs uppercase tracking-[0.18em] text-stone-300">
            <tr>
              {['Vendor', 'Code', 'Email', 'Mobile', 'Status', 'Action'].map((column) => (
                <th className="px-4 py-3 font-semibold" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr className="border-t border-white/10" key={vendor.id}>
                <td className="px-4 py-3 font-semibold text-stone-50">{vendor.name}</td>
                <td className="px-4 py-3">{vendor.code}</td>
                <td className="px-4 py-3">{vendor.email || '-'}</td>
                <td className="px-4 py-3">{vendor.mobile || '-'}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={vendor.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {['active', 'inactive', 'suspended'].map((status) => (
                      <button
                        className={vendor.status === status ? 'tab-btn-active py-2' : 'secondary-btn py-2'}
                        key={status}
                        type="button"
                        onClick={() => onUpdateVendor(vendor.id, { status })}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                    <button
                      className="danger-btn py-2"
                      type="button"
                      onClick={() => onDeleteVendor(vendor.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const statusLabel = status || 'active'
  const className =
    statusLabel === 'active'
      ? 'bg-emerald-300/15 text-emerald-200'
      : statusLabel === 'inactive'
        ? 'bg-amber-300/15 text-amber-200'
        : 'bg-rose-300/15 text-rose-200'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}>
      {statusLabel}
    </span>
  )
}

function getUserContactKey(user) {
  return normalizeContactKey(user?.mobile || user?.email)
}

function getSessionContactKey(session) {
  return normalizeContactKey(session?.ownerMobile || session?.ownerEmail)
}

function getScriptContactKey(script) {
  return normalizeContactKey(script?.mobile || script?.email)
}

function normalizeContactKey(value) {
  const contact = String(value || '').trim().toLowerCase()
  if (!contact) {
    return ''
  }

  return contact.includes('@') ? `email:${contact}` : `mobile:${contact.replace(/\D/g, '')}`
}

function formatDateTime(value) {
  if (!value) {
    return 'Not yet'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatDuration(startValue, endValue) {
  if (!startValue) {
    return '00:00:00'
  }

  const endTime = endValue ? new Date(endValue).getTime() : Date.now()
  const startTime = new Date(startValue).getTime()
  const totalSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000))
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function parseCsvRows(text, keys) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitCsvLine(line))
    .filter((values) => {
      const first = String(values[0] || '').trim().toLowerCase()
      return first && first !== keys[0].toLowerCase()
    })
    .map((values) =>
      keys.reduce((row, key, index) => {
        row[key] = String(values[index] || '').trim()
        return row
      }, {}),
    )
}

function splitCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)
  return values
}

function readTextFile(file, setter) {
  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.addEventListener('load', () => {
    setter(String(reader.result || ''))
  })
  reader.readAsText(file)
}

function truncateText(value, maxLength) {
  const text = String(value || '')
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function buildWavFileName(session, track) {
  return `${slugify(session.title)}-${session.ownerUserId || 'user'}-${track}.wav`
}

function buildWavDownloadUrl(recording, session, track) {
  const url = recording?.url || ''
  if (url.includes('/upload/')) {
    const fileName = buildWavFileName(session, track).replace(/\.wav$/i, '')
    return url.replace('/upload/', `/upload/f_wav,fl_attachment:${fileName}/`)
  }
  return url
}

function slugify(value) {
  return String(value || 'recording')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export default AdminPage
