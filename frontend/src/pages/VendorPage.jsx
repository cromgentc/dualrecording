import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import ToastMessage from '../components/ToastMessage'
import UserBar from '../components/UserBar'
import { apiRequest, POLL_INTERVAL } from '../lib/podcast'

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

function VendorPage({ authToken, user, onLogout }) {
  const [sessions, setSessions] = useState([])
  const [users, setUsers] = useState([])
  const [vendors, setVendors] = useState([])
  const [message, setMessage] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '123456',
    scriptMode: 'script',
  })
  const [profile, setProfile] = useState({
    name: user.name || '',
    email: user.email || '',
    mobile: user.mobile || '',
    companyName: '',
    address: '',
    contactPerson: user.name || '',
    notes: '',
  })

  const vendor = useMemo(
    () => vendors.find((item) => item.id === user.vendorId) || null,
    [user.vendorId, vendors],
  )

  function openProfileEditor() {
    setProfile({
      name: vendor?.name || user.name || '',
      email: vendor?.email || user.email || '',
      mobile: vendor?.mobile || user.mobile || '',
      companyName: vendor?.profile?.companyName || vendor?.name || '',
      address: vendor?.profile?.address || '',
      contactPerson: vendor?.profile?.contactPerson || user.name || '',
      notes: vendor?.profile?.notes || '',
    })
    setProfileOpen(true)
  }

  const vendorUsers = useMemo(
    () => users.filter((item) => item.vendorId === user.vendorId && item.role === 'user'),
    [user.vendorId, users],
  )

  const stats = useMemo(() => {
    const ready = sessions.filter((session) => session.recordingState === 'ready').length
    return {
      users: vendorUsers.length,
      recorded: ready,
      pending: Math.max(0, vendorUsers.length - ready),
      live: sessions.filter((session) => session.recordingState === 'recording').length,
    }
  }, [sessions, vendorUsers.length])

  const loadData = useCallback(async () => {
    try {
      const [sessionData, userData, vendorData] = await Promise.all([
        apiRequest('/api/sessions', { authToken }),
        apiRequest('/api/admin/users', { authToken }),
        apiRequest('/api/admin/vendors', { authToken }),
      ])
      startTransition(() => {
        setSessions(sessionData)
        setUsers(userData)
        setVendors(vendorData)
      })
    } catch (error) {
      setMessage(error.message)
    }
  }, [authToken])

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void loadData()
    }, 0)
    const intervalId = window.setInterval(() => {
      void loadData()
    }, POLL_INTERVAL)
    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [loadData])

  async function handleSaveProfile(event) {
    event.preventDefault()
    try {
      const [profileResult, vendorResult] = await Promise.all([
        apiRequest('/api/auth/profile', {
          method: 'POST',
          authToken,
          body: JSON.stringify({
            name: profile.contactPerson || profile.name,
            email: profile.email,
            mobile: profile.mobile,
          }),
        }),
        vendor
          ? apiRequest(`/api/admin/vendors/${vendor.id}`, {
              method: 'POST',
              authToken,
              body: JSON.stringify({
                name: profile.name,
                email: profile.email,
                mobile: profile.mobile,
                profile: {
                  companyName: profile.companyName,
                  address: profile.address,
                  contactPerson: profile.contactPerson,
                  notes: profile.notes,
                },
              }),
            })
          : Promise.resolve(null),
      ])

      if (vendorResult) {
        setVendors((current) =>
          current.map((item) => (item.id === vendorResult.id ? vendorResult : item)),
        )
      }

      if (profileResult?.user) {
        setProfile((current) => ({
          ...current,
          contactPerson: profileResult.user.name || current.contactPerson,
        }))
      }

      setProfileOpen(false)
      setMessage('Vendor profile save ho gaya.')
    } catch (error) {
      setMessage(error.message)
    }
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
        scriptMode: 'script',
      })
      setUserModalOpen(false)
      setMessage('User register ho gaya.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <main className="page-shell py-8">
      <ToastMessage message={message} onClose={() => setMessage('')} />
      <UserBar user={user} onLogout={onLogout} />

      <section className="glass-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Vendor Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-50">
              {vendor?.name || user.name}
            </h1>
            <p className="mt-2 text-sm text-stone-300">
              Code {vendor?.code || user.vendorCode || '-'} | {vendor?.status || user.status}
            </p>
          </div>
          <button className="secondary-btn" type="button" onClick={openProfileEditor}>
            Edit Profile
          </button>
          <button className="primary-btn" type="button" onClick={() => setUserModalOpen(true)}>
            Register User
          </button>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users Inside Vendor" value={stats.users} />
        <StatCard label="Recording Done" value={stats.recorded} />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Live Recording" value={stats.live} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TableCard
          title="Vendor users"
          columns={['User ID', 'Name', 'Mobile', 'Script Type', 'Status']}
          rows={vendorUsers.map((item) => [
            item.id,
            item.name,
            item.mobile,
            item.scriptMode === 'non-script' ? 'Non Script' : 'Script',
            item.status,
          ])}
        />
        <TableCard
          title="Completed recordings"
          columns={['Title', 'User ID', 'Name', 'Mobile', 'Duration']}
          rows={sessions
            .filter((session) => session.recordingState === 'ready')
            .map((session) => [
              session.title,
              session.ownerUserId,
              session.ownerName,
              session.ownerMobile || '-',
              formatDuration(
                session.participants?.host?.joinedAt,
                session.participants?.host?.lastSeenAt,
              ),
            ])}
        />
      </section>

      {profileOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
          <form className="glass-card w-full max-w-lg p-6" onSubmit={handleSaveProfile}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Profile</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
                  Edit vendor profile
                </h2>
              </div>
              <button className="ghost-btn px-4 py-2" type="button" onClick={() => setProfileOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              {['name', 'email', 'mobile', 'companyName', 'address', 'contactPerson', 'notes'].map((key) => (
                <label className="block" key={key}>
                  <span className="eyebrow">{profileLabel(key)}</span>
                  {key === 'notes' || key === 'address' ? (
                    <textarea
                      className="field mt-2 min-h-24"
                      value={profile[key]}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  ) : (
                    <input
                      className="field mt-2"
                      type={key === 'email' ? 'email' : 'text'}
                      value={profile[key]}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <button className="primary-btn mt-5 w-full" type="submit">
              Save Profile
            </button>
          </form>
        </div>
      ) : null}

      {userModalOpen ? (
        <UserRegisterModal
          form={userForm}
          onClose={() => setUserModalOpen(false)}
          onSubmit={handleCreateUser}
          setForm={setUserForm}
        />
      ) : null}
    </main>
  )
}

function UserRegisterModal({ form, onClose, onSubmit, setForm }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <form className="glass-card w-full max-w-lg p-6" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Register User</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-50">
              Create user account
            </h2>
          </div>
          <button className="ghost-btn px-4 py-2" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          {['name', 'email', 'mobile', 'password'].map((key) => (
            <label className="block" key={key}>
              <span className="eyebrow">
                {key === 'mobile' ? 'Mobile' : key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <input
                className="field mt-2"
                type={key === 'email' ? 'email' : key === 'password' ? 'password' : 'text'}
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [key]: event.target.value }))
                }
              />
            </label>
          ))}
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
        <button className="primary-btn mt-5 w-full" type="submit">
          Register User
        </button>
      </form>
    </div>
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

function TableCard({ title, columns, rows }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <p className="eyebrow">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm text-stone-200">
          <thead className="bg-white/6 text-xs uppercase tracking-[0.18em] text-stone-300">
            <tr>
              {columns.map((column) => (
                <th className="px-4 py-3 font-semibold" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr className="border-t border-white/10" key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td className="px-4 py-3" key={`${cell}-${cellIndex}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr className="border-t border-white/10">
                <td className="px-4 py-4 text-stone-300" colSpan={columns.length}>
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function profileLabel(key) {
  return (
    {
      name: 'Vendor Name',
      email: 'Email',
      mobile: 'Mobile',
      companyName: 'Company Name',
      address: 'Address',
      contactPerson: 'Contact Person',
      notes: 'Notes',
    }[key] || key
  )
}

export default VendorPage
