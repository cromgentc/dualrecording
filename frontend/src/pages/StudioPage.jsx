import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import ToastMessage from '../components/ToastMessage'
import UserBar from '../components/UserBar'
import {
  HEARTBEAT_INTERVAL,
  POLL_INTERVAL,
  RTC_CONFIGURATION,
  SIGNAL_INTERVAL,
  AUTH_TOKEN_KEY,
  apiRequest,
  buildApiUrl,
  pickAudioMimeType,
} from '../lib/podcast'

const AUTO_STOP_SECONDS = 170

function formatDuration(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function SpeakerMiniCard({ active, label, participant }) {
  return (
    <div
      className={`min-w-0 rounded-2xl border px-3 py-3 ${
        active ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-stone-400">
        {label}
      </span>
      <strong className="mt-1 block truncate text-xs font-semibold text-stone-50">
        {participant?.label || 'Waiting'}
      </strong>
      <span className={participant?.joined ? 'mt-2 block text-[0.65rem] font-semibold text-emerald-200' : 'mt-2 block text-[0.65rem] font-semibold text-stone-400'}>
        {participant?.joined ? 'Joined' : 'Waiting'}
      </span>
    </div>
  )
}

function StudioPage({ sessionId, role, token, user, onLogout }) {
  // Studio behavior changes by role: host creates offers and controls recording.
  const isHost = role === 'host'
  const otherRole = isHost ? 'guest' : 'host'
  const defaultName = isHost ? 'Speaker 1' : 'Speaker 2'

  const [session, setSession] = useState(null)
  const [displayName, setDisplayName] = useState(defaultName)
  const [loading, setLoading] = useState(true)
  const [joinBusy, setJoinBusy] = useState(false)
  const [error, setError] = useState('')
  const [activity, setActivity] = useState('Studio ready. Join to connect your microphone.')
  const [joined, setJoined] = useState(false)
  const [connected, setConnected] = useState(false)
  const [remoteReady, setRemoteReady] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [recording, setRecording] = useState(false)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [nextScript, setNextScript] = useState(null)
  const [currentScriptVisible, setCurrentScriptVisible] = useState(true)
  const [uploads, setUploads] = useState({
    host: 'idle',
    guest: 'idle',
    mixed: 'idle',
  })
  const [uploadProgress, setUploadProgress] = useState({
    host: 0,
    guest: 0,
    mixed: 0,
  })

  const audioRef = useRef(null)
  // Refs hold browser/WebRTC objects that should not trigger React re-renders.
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const signalCursorRef = useRef(0)
  const makingOfferRef = useRef(false)
  const pendingCandidatesRef = useRef([])
  const mixerRef = useRef({
    context: null,
    destination: null,
    localSource: null,
    remoteSource: null,
  })
  const recordersRef = useRef({})
  const countdownTimerRef = useRef(null)
  const countdownResolveRef = useRef(null)
  const durationTimerRef = useRef(null)
  const recordingStartCancelledRef = useRef(false)
  const autoStopTriggeredRef = useRef(false)
  const nextScriptLoadedForSessionRef = useRef('')
  const recordingActiveRef = useRef(false)

  const uploadTracks = useMemo(() => (isHost ? [role, 'mixed'] : [role]), [isHost, role])

  const loadSession = useEffectEvent(async () => {
    // Invite tokens let each speaker load only the session they were invited to.
    try {
      const nextSession = await apiRequest(
        `/api/sessions/${sessionId}?role=${role}&token=${token}`,
      )
      setSession(nextSession)
      setCurrentScriptVisible(nextSession.recordingState !== 'ready')
      setDisplayName((current) => current || nextSession.participants[role].label)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    // Keep session metadata updated while the studio is open.
    const initialLoadId = window.setTimeout(() => {
      void loadSession()
    }, 0)

    const intervalId = window.setInterval(() => {
      void loadSession()
    }, POLL_INTERVAL)

    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    // Heartbeats update presence without requiring a persistent socket connection.
    if (!joined) {
      return undefined
    }

    const heartbeatId = window.setInterval(async () => {
      try {
        await apiRequest(`/api/sessions/${sessionId}/participants/ping`, {
          method: 'POST',
          body: JSON.stringify({
            role,
            token,
            name: displayName,
          }),
        })
      } catch (heartbeatError) {
        setError(heartbeatError.message)
      }
    }, HEARTBEAT_INTERVAL)

    return () => window.clearInterval(heartbeatId)
  }, [displayName, joined, role, sessionId, token])

  useEffect(() => {
    return () => {
      cleanupStudio()
    }
    // Studio resources should be released only when this page unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendSignal(type, payload, toRole = otherRole) {
    // WebRTC offers, answers, candidates, and control messages all share this endpoint.
    await apiRequest(`/api/sessions/${sessionId}/signals`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        payload,
        toRole,
        fromRole: role,
        token,
      }),
    })
  }

  function ensureRemoteAudio(stream) {
    // Attach the peer stream to both playback and the host's mixed recording pipeline.
    remoteStreamRef.current = stream
    if (audioRef.current) {
      audioRef.current.srcObject = stream
    }
    setRemoteReady(true)
    attachRemoteToMixer(stream)
  }

  function attachRemoteToMixer(stream) {
    const mixer = mixerRef.current
    if (!mixer.context || !mixer.destination || mixer.remoteSource || !stream) {
      return
    }

    mixer.remoteSource = mixer.context.createMediaStreamSource(stream)
    mixer.remoteSource.connect(mixer.destination)
  }

  async function ensureMixer() {
    // Host records a combined local+remote stream in addition to isolated tracks.
    if (!isHost || !localStreamRef.current) {
      return null
    }

    const mixer = mixerRef.current
    if (!mixer.context) {
      mixer.context = new AudioContext()
      mixer.destination = mixer.context.createMediaStreamDestination()
      mixer.localSource = mixer.context.createMediaStreamSource(localStreamRef.current)
      mixer.localSource.connect(mixer.destination)
    }

    if (mixer.context.state === 'suspended') {
      await mixer.context.resume()
    }

    if (remoteStreamRef.current) {
      attachRemoteToMixer(remoteStreamRef.current)
    }

    return mixer.destination.stream
  }

  async function flushPendingCandidates() {
    // ICE candidates can arrive before the offer/answer is applied.
    if (!pcRef.current?.remoteDescription) {
      return
    }

    while (pendingCandidatesRef.current.length) {
      const candidate = pendingCandidatesRef.current.shift()
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  function clearCountdownTimer() {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    if (countdownResolveRef.current) {
      countdownResolveRef.current()
      countdownResolveRef.current = null
    }
    setCountdown(0)
  }

  function clearDurationTimer() {
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
  }

  function startRecordingCountdown() {
    clearCountdownTimer()
    setCountdown(3)

    return new Promise((resolve) => {
      let nextValue = 3
      countdownResolveRef.current = resolve
      countdownTimerRef.current = window.setInterval(() => {
        nextValue -= 1
        setCountdown(nextValue)

        if (nextValue <= 0) {
          clearCountdownTimer()
        }
      }, 1000)
    })
  }

  function startDurationTimer() {
    clearDurationTimer()
    setDurationSeconds(0)
    durationTimerRef.current = window.setInterval(() => {
      setDurationSeconds((current) => {
        const nextValue = current + 1
        if (
          isHost &&
          recordingActiveRef.current &&
          nextValue >= AUTO_STOP_SECONDS &&
          !autoStopTriggeredRef.current
        ) {
          autoStopTriggeredRef.current = true
          void stopRecording({ notifyPeer: true })
        }
        return nextValue
      })
    }, 1000)
  }

  const scheduleStudioRefreshOnce = useCallback(() => {
    const refreshKey = `studio-refresh-after-ready-${sessionId}`
    if (window.sessionStorage.getItem(refreshKey)) {
      return
    }

    window.sessionStorage.setItem(refreshKey, '1')
    window.setTimeout(() => {
      window.location.reload()
    }, 1800)
  }, [sessionId])

  const loadNextScriptPreview = useCallback(async () => {
    const authToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || ''

    try {
      const payload = await apiRequest(
        `/api/sessions/${sessionId}/scripts/next?role=${role}&token=${token}`,
        authToken ? { authToken } : {},
      )
      setNextScript(payload.script || null)
      setCurrentScriptVisible(false)
      setActivity(
        payload.script
          ? 'Recording upload complete. The next script is ready.'
          : 'All assigned scripts are complete. Please contact your admin for more work.',
      )
      scheduleStudioRefreshOnce()
    } catch (nextScriptError) {
      if (!authToken) {
        setError(nextScriptError.message)
        return
      }

      try {
        const payload = await apiRequest('/api/scripts/assigned', { authToken })
        setNextScript(payload.script || null)
        setCurrentScriptVisible(false)
        setActivity(
          payload.script
            ? 'Recording upload complete. The next script is ready.'
            : 'All assigned scripts are complete. Please contact your admin for more work.',
        )
        scheduleStudioRefreshOnce()
      } catch (fallbackError) {
        setError(fallbackError.message)
      }
    }
  }, [role, scheduleStudioRefreshOnce, sessionId, token])

  function uploadBlobWithProgress(track, blob) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const url = buildApiUrl(
        `/api/sessions/${sessionId}/recordings?role=${role}&token=${token}&track=${track}`,
      )

      xhr.open('POST', url)
      xhr.setRequestHeader('Content-Type', blob.type || 'audio/webm')

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          return
        }

        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100))
        setUploadProgress((current) => ({ ...current, [track]: percent }))
      })

      xhr.addEventListener('load', () => {
        const contentType = xhr.getResponseHeader('content-type') || ''
        const payload = contentType.includes('application/json')
          ? JSON.parse(xhr.responseText || '{}')
          : xhr.responseText

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(payload?.error || 'Recording upload failed.'))
          return
        }

        resolve(payload)
      })

      xhr.addEventListener('error', () => reject(new Error('Recording upload failed.')))
      xhr.send(blob)
    })
  }

  async function uploadRecording(track, blob) {
    // Stop events upload each recorded blob back to the backend storage folder.
    setUploads((current) => ({ ...current, [track]: 'uploading' }))
    setUploadProgress((current) => ({ ...current, [track]: 0 }))

    try {
      const recordingMeta = await uploadBlobWithProgress(track, blob)

      setUploads((current) => ({ ...current, [track]: 'done' }))
      setUploadProgress((current) => ({ ...current, [track]: 100 }))
      setSession((current) =>
        current
          ? {
              ...current,
              recordings: {
                ...current.recordings,
                [track]: recordingMeta,
              },
            }
          : current,
      )
      setActivity(`${track} track uploaded.`)
    } catch (uploadError) {
      setUploads((current) => ({ ...current, [track]: 'error' }))
      setError(uploadError.message)
    }
  }

  function buildRecorder(stream, track) {
    // MediaRecorder chunks are buffered locally until recording stops.
    const mimeType = pickAudioMimeType()
    const chunks = []
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream)

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) {
        chunks.push(event.data)
      }
    })

    recorder.addEventListener('stop', () => {
      if (!chunks.length) {
        return
      }

      const blob = new Blob(chunks, {
        type: recorder.mimeType || mimeType || 'audio/webm',
      })
      uploadRecording(track, blob)
    })

    return recorder
  }

  async function beginRecording({ notifyPeer = false } = {}) {
    // Host may notify the guest so both isolated tracks start together.
    if (!localStreamRef.current || recording || countdown) {
      return
    }

    recordingStartCancelledRef.current = false
    autoStopTriggeredRef.current = false
    nextScriptLoadedForSessionRef.current = ''
    setNextScript(null)
    setCurrentScriptVisible(true)
    setUploads({
      host: 'idle',
      guest: 'idle',
      mixed: 'idle',
    })
    setUploadProgress({
      host: 0,
      guest: 0,
      mixed: 0,
    })

    if (notifyPeer && isHost) {
      await sendSignal('control', { action: 'start-recording' })
    }

    setActivity('Recording will start after a 3 second countdown.')
    await startRecordingCountdown()
    if (recordingStartCancelledRef.current) {
      setActivity('Recording start was cancelled.')
      return
    }

    const nextRecorders = {}
    nextRecorders[role] = buildRecorder(localStreamRef.current, role)

    if (isHost) {
      const mixedStream = await ensureMixer()
      if (mixedStream) {
        nextRecorders.mixed = buildRecorder(mixedStream, 'mixed')
      }
    }

    Object.values(nextRecorders).forEach((recorder) => recorder.start(1000))
    recordersRef.current = nextRecorders
    recordingActiveRef.current = true
    setRecording(true)
    startDurationTimer()
    setActivity('Recording is live. Browser tracks are being captured.')
  }

  async function stopRecording({ notifyPeer = false } = {}) {
    // Stopping recorders triggers their upload handlers.
    if (!recordingActiveRef.current && !countdown) {
      return
    }

    clearCountdownTimer()
    clearDurationTimer()
    recordingStartCancelledRef.current = true

    Object.values(recordersRef.current).forEach((recorder) => {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
    })

    recordersRef.current = {}
    recordingActiveRef.current = false
    setRecording(false)
    setActivity('Recording stopped. Uploads are processing.')

    if (notifyPeer && isHost) {
      await sendSignal('control', { action: 'stop-recording' })
    }
  }

  const processSignal = useEffectEvent(async (signal) => {
    // Polling delivers signaling events in order by cursor.
    const pc = pcRef.current

    if (signal.type === 'participant-joined' && isHost && joined) {
      await createAndSendOffer()
      return
    }

    if (signal.type === 'offer' && pc && !isHost) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload))
      await flushPendingCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendSignal('answer', answer)
      setActivity('Connecting with the host.')
      return
    }

    if (signal.type === 'answer' && pc && isHost && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload))
      await flushPendingCandidates()
      setActivity('Guest connected. Live monitoring is active.')
      return
    }

    if (signal.type === 'candidate' && pc && signal.payload?.candidate) {
      if (!pc.remoteDescription) {
        pendingCandidatesRef.current.push(signal.payload.candidate)
        return
      }

      await pc.addIceCandidate(new RTCIceCandidate(signal.payload.candidate))
      return
    }

    if (signal.type === 'control' && !isHost) {
      if (signal.payload?.action === 'start-recording') {
        await beginRecording()
      }
      if (signal.payload?.action === 'stop-recording') {
        await stopRecording()
      }
      if (signal.payload?.action === 'host-logout') {
        cleanupStudio()
        setJoined(false)
        setConnected(false)
        setRemoteReady(false)
        setCurrentScriptVisible(false)
        setActivity('Host logged out. Redirecting to login.')
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
        window.history.replaceState({}, '', '/')
        window.location.assign('/')
      }
    }
  })

  useEffect(() => {
    // Once joined, keep checking for peer signaling messages.
    if (!joined) {
      return undefined
    }

    const signalId = window.setInterval(async () => {
      try {
        const payload = await apiRequest(
          `/api/sessions/${sessionId}/signals?role=${role}&token=${token}&cursor=${signalCursorRef.current}`,
        )

        signalCursorRef.current = payload.cursor
        for (const signal of payload.signals) {
          await processSignal(signal)
        }
      } catch (signalError) {
        setError(signalError.message)
      }
    }, SIGNAL_INTERVAL)

    return () => window.clearInterval(signalId)
  }, [joined, role, sessionId, token])

  useEffect(() => {
    if (
      !session ||
      session.recordingState !== 'ready' ||
      nextScriptLoadedForSessionRef.current === session.id
    ) {
      return
    }

    nextScriptLoadedForSessionRef.current = session.id
    void loadNextScriptPreview()
  }, [loadNextScriptPreview, session])

  function createPeerConnection(stream) {
    // The peer connection carries only audio tracks for this recording room.
    const pc = new RTCPeerConnection(RTC_CONFIGURATION)

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream)
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal('candidate', { candidate: event.candidate.toJSON() })
      }
    }

    pc.ontrack = (event) => {
      const [incomingStream] = event.streams
      if (incomingStream) {
        ensureRemoteAudio(incomingStream)
      } else {
        const streamWithTrack = new MediaStream([event.track])
        ensureRemoteAudio(streamWithTrack)
      }
    }

    pc.onconnectionstatechange = () => {
      const connectedNow = ['connected', 'completed'].includes(pc.connectionState)
      setConnected(connectedNow)

      if (connectedNow) {
        setActivity('Both speakers can hear each other. Recording will start only when the host starts it.')
      }
    }

    pcRef.current = pc
    return pc
  }

  async function createAndSendOffer() {
    // Only the host initiates offers; the flag prevents overlapping negotiations.
    if (!isHost || !pcRef.current || makingOfferRef.current) {
      return
    }

    try {
      makingOfferRef.current = true
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
      })
      await pcRef.current.setLocalDescription(offer)
      await sendSignal('offer', offer)
      setActivity('Invite room is ready. The call will connect when the guest answers.')
    } finally {
      makingOfferRef.current = false
    }
  }

  function cleanupStudio() {
    // Release microphone, peer connection, recorder, and audio mixer resources.
    Object.values(recordersRef.current).forEach((recorder) => {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
    })
    recordersRef.current = {}
    recordingActiveRef.current = false

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }

    if (audioRef.current) {
      audioRef.current.srcObject = null
    }

    if (mixerRef.current.context) {
      mixerRef.current.context.close().catch(() => {})
    }

    mixerRef.current = {
      context: null,
      destination: null,
      localSource: null,
      remoteSource: null,
    }
    pendingCandidatesRef.current = []
    clearCountdownTimer()
    clearDurationTimer()
  }

  async function handleJoin() {
    // Joining starts mic capture first, then announces presence to the session.
    setJoinBusy(true)
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      localStreamRef.current = stream
      createPeerConnection(stream)

      const nextSession = await apiRequest(`/api/sessions/${sessionId}/participants/join`, {
        method: 'POST',
        body: JSON.stringify({
          role,
          token,
          name: displayName,
        }),
      })

      setSession(nextSession)
      setJoined(true)
      setActivity('Microphone connected. Live audio room is starting. Recording is not active yet.')

      if (isHost) {
        await createAndSendOffer()
      }
    } catch (joinError) {
      cleanupStudio()
      setError(joinError.message)
    } finally {
      setJoinBusy(false)
    }
  }

  async function handleStudioLogout() {
    try {
      if (isHost) {
        if (recordingActiveRef.current || countdown) {
          await stopRecording({ notifyPeer: true })
        }
        await sendSignal('control', { action: 'host-logout' })
      }
      cleanupStudio()
      setJoined(false)
      setConnected(false)
      setRemoteReady(false)
      setCurrentScriptVisible(false)
      await loadNextScriptPreview()
    } catch (logoutError) {
      setError(logoutError.message)
    } finally {
      window.setTimeout(() => {
        window.localStorage.removeItem(AUTH_TOKEN_KEY)
        void onLogout()
        window.history.replaceState({}, '', '/')
        window.location.assign('/')
      }, 800)
    }
  }

  if (loading) {
    return (
      <main className="page-shell py-8">
        <div className="glass-card p-8 text-center text-stone-200">
          Loading studio...
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="page-shell py-8">
        <div className="glass-card p-8 text-center text-rose-200">
          {error || 'Session not found.'}
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell overflow-x-hidden py-4 sm:py-8">
      <ToastMessage
        message={error || activity}
        tone={error ? 'error' : 'default'}
        onClose={() => {
          setError('')
          setActivity('')
        }}
      />
      {user ? <UserBar user={user} onLogout={handleStudioLogout} compact /> : null}

      <section className="min-w-0">
        <div className="glass-card min-w-0 overflow-hidden p-4 sm:p-7">
          <div className="grid min-w-0 gap-3">
            <div className="grid min-w-0 gap-3 rounded-3xl border border-white/10 bg-white/6 p-3">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3">
                <span className="eyebrow">Recording Upload</span>
                <div className="mt-3 grid min-w-0 gap-3">
                  {uploadTracks.map((track) => (
                    <div className="min-w-0" key={track}>
                      <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                        <strong className="min-w-0 truncate font-semibold capitalize text-stone-50">
                          {track === 'mixed' ? 'Mixed' : track}
                        </strong>
                        <span className="shrink-0 text-stone-300">
                          {uploads[track] === 'done'
                            ? '100%'
                            : uploads[track] === 'uploading'
                              ? `${uploadProgress[track]}%`
                              : uploads[track] === 'error'
                                ? 'Failed'
                                : 'Waiting'}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-amber-300 transition-all"
                          style={{ width: `${uploadProgress[track]}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/80 px-3 py-4 text-center">
                <strong className="block text-3xl font-semibold tabular-nums tracking-normal text-stone-50 sm:text-4xl">
                  {countdown ? countdown : formatDuration(durationSeconds)}
                </strong>
                <span className="mt-1 block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  {recording ? 'Live' : 'Timer'}
                </span>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <SpeakerMiniCard
                  label="Speaker 1"
                  participant={session.participants.host}
                  active={role === 'host'}
                />
                <SpeakerMiniCard
                  label="Speaker 2"
                  participant={session.participants.guest}
                  active={role === 'guest'}
                />
              </div>
            </div>

            {currentScriptVisible && session.scriptText ? (
              <div className="info-card min-w-0 overflow-hidden">
                <span className="eyebrow">{session.scriptTitle || 'Assigned Script'}</span>
                <p className="mt-3 max-w-full whitespace-pre-wrap break-all text-left text-sm leading-6 text-stone-200 [overflow-wrap:anywhere]">
                  {session.scriptText}
                </p>
              </div>
            ) : null}

            {nextScript ? (
              <div className="info-card min-w-0 overflow-hidden border-amber-300/40">
                <span className="eyebrow">Next Script</span>
                <strong className="mt-2 block max-w-full break-all text-lg font-semibold text-stone-50 [overflow-wrap:anywhere]">
                  {nextScript.title}
                </strong>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <span className="text-sm text-stone-300">
                    Speaker 1: {nextScript.speaker1Label || 'Speaker 1'}
                  </span>
                  <span className="text-sm text-stone-300">
                    Speaker 2: {nextScript.speaker2Label || 'Speaker 2'}
                  </span>
                </div>
                <p className="mt-3 max-w-full whitespace-pre-wrap break-all text-left text-sm leading-6 text-stone-200 [overflow-wrap:anywhere]">
                  {nextScript.script}
                </p>
              </div>
            ) : null}

            {!nextScript && !currentScriptVisible ? (
              <div className="info-card min-w-0 overflow-hidden border-amber-300/40">
                <span className="eyebrow">No Pending Script</span>
                <p className="mt-3 text-sm leading-6 text-stone-200">
                  All assigned scripts are complete. Please contact your admin for more work.
                </p>
              </div>
            ) : null}

            <p className="text-sm text-stone-300">
              {joined
                ? connected
                  ? remoteReady
                    ? recording
                      ? 'Recording is active. Keep speaking clearly.'
                      : 'Live audio is connected. Recording has not started yet.'
                    : 'Mic granted. Peer connected. Waiting for remote audio.'
                  : 'Mic granted. Waiting for the peer connection.'
                : 'Join the room to connect your microphone and start setup.'}
            </p>
          </div>

          <button
            className="primary-btn mt-6 w-full"
            type="button"
            onClick={handleJoin}
            disabled={joinBusy || joined}
          >
            {joinBusy ? 'Joining...' : joined ? 'Joined' : 'Join Recording Room'}
          </button>

          {isHost ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                className="secondary-btn flex-1"
                type="button"
                onClick={() => beginRecording({ notifyPeer: true })}
                disabled={!joined || recording || Boolean(countdown)}
              >
                {countdown ? `Starting ${countdown}` : 'Start Recording'}
              </button>
              <button
                className="danger-btn flex-1"
                type="button"
                onClick={() => stopRecording({ notifyPeer: true })}
                disabled={!recording && !countdown}
              >
                Stop Recording
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-300">
              Guest recording starts and stops from the host controls.
            </p>
          )}

        </div>
        <audio ref={audioRef} className="hidden" autoPlay playsInline />
      </section>
    </main>
  )
}

export default StudioPage
