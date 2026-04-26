import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import StatusPill from '../components/StatusPill'
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
  const [activity, setActivity] = useState('Studio ready. Join karte hi mic connect hoga.')
  const [joined, setJoined] = useState(false)
  const [connected, setConnected] = useState(false)
  const [remoteReady, setRemoteReady] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [recording, setRecording] = useState(false)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [nextScript, setNextScript] = useState(null)
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

  async function loadNextScriptPreview() {
    const authToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || ''
    if (!authToken) {
      return
    }

    try {
      const payload = await apiRequest('/api/scripts/assigned', { authToken })
      setNextScript(payload.script || null)
      setActivity(
        payload.script
          ? 'Recording upload complete. Next script ready hai.'
          : 'Recording upload complete. Ab koi pending script nahi hai.',
      )
    } catch (nextScriptError) {
      setError(nextScriptError.message)
    }
  }

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
      setActivity(`${track} track upload ho gaya.`)
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

    setActivity('Recording 3 second countdown ke baad start hogi.')
    await startRecordingCountdown()
    if (recordingStartCancelledRef.current) {
      setActivity('Recording start cancel ho gaya.')
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
    setActivity('Recording live hai. Browser tracks capture kar raha hai.')
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
    setActivity('Recording stop hui. Uploads process ho rahe hain.')

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
      setActivity('Host ke saath connection establish ho raha hai.')
      return
    }

    if (signal.type === 'answer' && pc && isHost && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload))
      await flushPendingCandidates()
      setActivity('Guest connected. Live monitoring active hai.')
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
  }, [session])

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
        setActivity('Dono speakers live audio room mein connected hain.')
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
      setActivity('Invite room ready hai. Guest answer dete hi call connect ho jayegi.')
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
      setActivity('Mic connected. Ab signaling aur room setup start ho gaya hai.')

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

  if (loading) {
    return (
      <main className="page-shell py-8">
        <div className="glass-card p-8 text-center text-stone-200">
          Studio load ho raha hai...
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
    <main className="page-shell py-8">
      <ToastMessage
        message={error || activity}
        tone={error ? 'error' : 'default'}
        onClose={() => {
          setError('')
          setActivity('')
        }}
      />
      {user ? <UserBar user={user} onLogout={onLogout} /> : null}

      <section className="glass-card flex min-h-[56vh] items-center justify-center p-8 text-center">
        <strong className="block text-7xl font-semibold tabular-nums tracking-normal text-stone-50 sm:text-8xl lg:text-9xl">
          {countdown ? countdown : formatDuration(durationSeconds)}
        </strong>
      </section>

      <section>
        <div className="glass-card mt-6 p-7">
          <div>
            <p className="eyebrow">Identity</p>
            <h2 className="text-3xl font-semibold tracking-tight text-stone-50">
              {session.title}
            </h2>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="info-card">
              <span className="eyebrow">Recording Upload</span>
              <div className="mt-3 grid gap-3">
                {uploadTracks.map((track) => (
                  <div key={track}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <strong className="font-semibold capitalize text-stone-50">
                        {track === 'mixed' ? 'Mixed' : track}
                      </strong>
                      <span className="text-stone-300">
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

            <div className="grid gap-3 sm:grid-cols-2">
              {['host', 'guest'].map((participantRole) => {
                const participant = session.participants[participantRole]
                return (
                  <div className="info-card" key={participantRole}>
                    <span className="eyebrow">
                      {participantRole === 'host' ? 'Speaker 1' : 'Speaker 2'}
                    </span>
                    <strong className="mt-2 block text-sm font-semibold text-stone-50">
                      {participant?.label || 'Not set'}
                    </strong>
                    <StatusPill tone={participant?.joined ? 'success' : 'muted'}>
                      {participant?.joined ? 'Joined' : 'Not joined'}
                    </StatusPill>
                  </div>
                )
              })}
            </div>

            {session.scriptText ? (
              <div className="info-card">
                <span className="eyebrow">{session.scriptTitle || 'Assigned Script'}</span>
                <p className="mt-3 whitespace-pre-wrap text-left text-sm leading-6 text-stone-200">
                  {session.scriptText}
                </p>
              </div>
            ) : null}

            {nextScript ? (
              <div className="info-card border-amber-300/40">
                <span className="eyebrow">Next Script</span>
                <strong className="mt-2 block text-lg font-semibold text-stone-50">
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
                <p className="mt-3 whitespace-pre-wrap text-left text-sm leading-6 text-stone-200">
                  {nextScript.script}
                </p>
              </div>
            ) : null}

            <p className="text-sm text-stone-300">
              {joined
                ? connected
                  ? remoteReady
                    ? 'Mic granted. Peer connected. Remote audio live.'
                    : 'Mic granted. Peer connected. Remote audio ka wait ho raha hai.'
                  : 'Mic granted. Peer connection ka wait ho raha hai.'
                : 'Join karte hi mic aur peer connection status yahin update hoga.'}
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
              Guest side par recording host ke control signal se start/stop hogi.
            </p>
          )}

        </div>
        <audio ref={audioRef} className="hidden" autoPlay playsInline />
      </section>
    </main>
  )
}

export default StudioPage
