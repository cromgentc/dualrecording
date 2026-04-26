import CopyRow from './CopyRow'
import StatusPill from './StatusPill'
import { absoluteUrl, formatDate, formatState } from '../lib/podcast'

function SessionCard({
  session,
  compact = false,
  showAdminView = true,
  showCreated = true,
  showHostInvite = true,
  showOwner = true,
  showRecordings = true,
  showHostJoin = false,
}) {
  // Compact mode is used inside the studio where invite/download details are hidden.
  const userRoomView =
    showHostJoin &&
    !showAdminView &&
    !showCreated &&
    !showHostInvite &&
    !showOwner &&
    !showRecordings

  if (userRoomView) {
    return (
      <article className="glass-card overflow-hidden">
        <div className="border-b border-white/10 bg-white/6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-300">
                <span className="truncate">ID {session.id}</span>
              </span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-50 sm:text-3xl">
                {session.title}
              </h3>
            </div>
            <StatusPill tone={session.recordingState === 'ready' ? 'success' : 'accent'}>
              {formatState(session.recordingState)}
            </StatusPill>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {['host', 'guest'].map((role) => {
              const participant = session.participants[role]
              return (
                <div className="info-card" key={role}>
                  <span className="eyebrow">
                    {role === 'host' ? 'Speaker 1' : 'Speaker 2'}
                  </span>
                  <strong className="mt-2 block truncate text-sm font-semibold text-stone-50">
                    {participant.label}
                  </strong>
                  <div className="mt-3">
                    <StatusPill tone={participant.joined ? 'success' : 'muted'}>
                      {participant.joined ? 'Joined' : 'Waiting'}
                    </StatusPill>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid content-start gap-3">
            <a
              className="primary-btn min-h-14 text-center"
              href={session.links.host}
              rel="noreferrer"
            >
              Join as Host
            </a>
            <CopyRow compact label="Guest Invite" value={session.links.guest} />
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="glass-card p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">ID {session.id}</p>
          <h3 className="text-xl font-semibold tracking-tight text-stone-50">
            {session.title}
          </h3>
        </div>
        <StatusPill tone={session.recordingState === 'ready' ? 'success' : 'accent'}>
          {formatState(session.recordingState)}
        </StatusPill>
      </div>

      {showCreated ? (
        <div className="info-card mt-5">
          <span className="eyebrow">Created</span>
          <strong className="mt-2 block text-sm font-semibold text-stone-50">
            {formatDate(session.createdAt)}
          </strong>
        </div>
      ) : null}

      {showOwner ? (
        <div className="info-card mt-3">
          <span className="eyebrow">Owner</span>
          <strong className="mt-2 block text-sm font-semibold text-stone-50">
            {session.ownerName || 'Admin user'}
          </strong>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        {['host', 'guest'].map((role) => {
          const participant = session.participants[role]
          return (
            <div
              className="info-card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
              key={role}
            >
              <div>
                <span className="eyebrow">{role === 'host' ? 'Speaker 1' : 'Speaker 2'}</span>
                <strong className="mt-2 block text-sm font-semibold text-stone-50">
                  {participant.label}
                </strong>
              </div>
              <StatusPill tone={participant.joined ? 'success' : 'muted'}>
                {participant.joined ? 'Joined' : 'Waiting'}
              </StatusPill>
            </div>
          )
        })}
      </div>

      {!compact && (
        <>
          <div className="mt-5 grid gap-3">
            {showHostJoin ? (
              <a
                className="primary-btn text-center"
                href={session.links.host}
                target="_blank"
                rel="noreferrer"
              >
                Open Host Studio
              </a>
            ) : null}
            {showHostInvite ? <CopyRow label="Host Invite" value={session.links.host} /> : null}
            <CopyRow label="Guest Invite" value={session.links.guest} />
            {showAdminView ? <CopyRow label="Admin View" value={session.links.admin} /> : null}
          </div>

          {showRecordings ? (
            <div className="mt-5 grid gap-3">
              {['host', 'guest', 'mixed'].map((track) => {
                // The backend exposes three downloadable tracks after upload completes.
                const recording = session.recordings[track]
                return (
                  <div
                    className="info-card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
                    key={track}
                  >
                    <div>
                      <span className="eyebrow">
                        {track === 'mixed' ? 'Combined Mix' : `${track} Isolated`}
                      </span>
                      <strong className="mt-2 block text-sm font-semibold text-stone-50">
                        {recording ? 'Available' : 'Not uploaded yet'}
                      </strong>
                    </div>
                    {recording ? (
                      <a
                        className="secondary-btn text-center"
                        href={absoluteUrl(recording.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-sm text-stone-300">Pending</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}
        </>
      )}
    </article>
  )
}

export default SessionCard
