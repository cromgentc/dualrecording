const fs = require('fs')
const path = require('path')
const { collectRequest, readJsonBody, sendJson, sendText } = require('../lib/http')
const { requireAuth, getAuthUser } = require('./authController')
const {
  createSession,
  getSessionById,
  listSessionsByOwner,
  listAllSessions,
  toPublicSession,
  validateRoleToken,
  updateParticipant,
  enqueueSignal,
  listSignalsForRole,
  updateRecordingState,
  saveRecording,
  getRecordingPath,
  getRecordingByFileName,
} = require('../models/sessionModel')
const { getUserById } = require('../models/userModel')
const { listScriptsForUser } = require('../models/scriptModel')

function getRequestOrigin(req, port) {
  // Invite links should point back to the frontend origin that created the session.
  const origin = req.headers.origin
  if (origin) {
    return origin
  }

  const host = req.headers.host || `localhost:${port}`
  const forwardedProto = req.headers['x-forwarded-proto'] || 'http'
  return `${forwardedProto}://${host}`
}

function ensureSession(sessionId, res) {
  // Centralized 404 handling keeps route handlers focused on their own rules.
  const session = getSessionById(sessionId)
  if (!session) {
    sendJson(res, 404, { error: 'Session not found.' })
    return null
  }

  return session
}

async function listSessions(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return
  }

  const sourceSessions =
    auth.user.role === 'admin'
      ? listAllSessions()
      : auth.user.role === 'vendor'
        ? listAllSessions().filter((session) => session.ownerVendorId === auth.user.vendorId)
        : listSessionsByOwner(auth.user.id)
  const payload = sourceSessions.map(toPublicSession)
  sendJson(res, 200, payload)
}

async function createSessionAction(req, res, context) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return
  }

  const body = await readJsonBody(req)
  const assignedScript = getNextScriptForUser(auth.user)
  const session = createSession(
    {
      ...body,
      scriptId: assignedScript?.id || '',
      scriptTitle: assignedScript?.title || '',
      scriptText: assignedScript?.script || '',
      title: body.title || assignedScript?.title || '',
      hostLabel: body.hostLabel || assignedScript?.speaker1Label || 'Speaker 1',
      guestLabel: body.guestLabel || assignedScript?.speaker2Label || 'Speaker 2',
    },
    getRequestOrigin(req, context.port),
    auth.user,
  )
  sendJson(res, 201, toPublicSession(session))
}

async function getAssignedScript(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return
  }

  sendJson(res, 200, {
    script: getNextScriptForUser(auth.user),
    scriptMode: auth.user.scriptMode === 'non-script' ? 'non-script' : 'script',
  })
}

async function getNextSessionScript(req, res, context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const role = context.searchParams.get('role')
  const token = context.searchParams.get('token')
  if (!validateRoleToken(session, role, token)) {
    sendJson(res, 403, { error: 'Invalid access token.' })
    return
  }

  const owner = getUserById(session.ownerUserId)
  if (!owner) {
    sendJson(res, 404, { error: 'Session owner not found.' })
    return
  }

  sendJson(res, 200, {
    script: getNextScriptForUser(owner),
    scriptMode: owner.scriptMode === 'non-script' ? 'non-script' : 'script',
  })
}

function getNextScriptForUser(user) {
  if (user?.scriptMode === 'non-script') {
    return null
  }

  const userScripts = listScriptsForUser(user)
  const completedScriptIds = new Set(
    listAllSessions()
      .filter(
        (session) =>
          session.ownerUserId === user.id &&
          session.scriptId &&
          session.recordingState === 'ready',
      )
      .map((session) => session.scriptId),
  )

  return userScripts.find((script) => !completedScriptIds.has(script.id)) || null
}

async function getSession(req, res, context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const role = context.searchParams.get('role')
  const token = context.searchParams.get('token')
  const adminToken = context.searchParams.get('admin')
  const auth = getAuthUser(req)

  // Studio links, admin links, and owner auth can all read the same public session.
  if (role && token && validateRoleToken(session, role, token)) {
    sendJson(res, 200, toPublicSession(session))
    return
  }

  if (adminToken && validateRoleToken(session, 'admin', adminToken)) {
    sendJson(res, 200, toPublicSession(session))
    return
  }

  if (auth && session.ownerUserId === auth.user.id) {
    sendJson(res, 200, toPublicSession(session))
    return
  }

  sendJson(res, 403, { error: 'Invalid access token.' })
}

async function joinParticipant(req, res, _context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const body = await readJsonBody(req)
  if (!validateRoleToken(session, body.role, body.token)) {
    sendJson(res, 403, { error: 'Invalid role token.' })
    return
  }

  const now = new Date().toISOString()
  updateParticipant(session, body.role, {
    joined: true,
    joinedAt: session.participants[body.role].joinedAt || now,
    lastSeenAt: now,
    label: body.name?.trim() || session.participants[body.role].label,
  })

  enqueueSignal(session, {
    type: 'participant-joined',
    fromRole: body.role,
    toRole: body.role === 'host' ? 'guest' : 'host',
    payload: { role: body.role },
  })

  sendJson(res, 200, toPublicSession(session))
}

async function pingParticipant(req, res, _context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const body = await readJsonBody(req)
  if (!validateRoleToken(session, body.role, body.token)) {
    sendJson(res, 403, { error: 'Invalid role token.' })
    return
  }

  updateParticipant(session, body.role, {
    joined: true,
    lastSeenAt: new Date().toISOString(),
    label: body.name?.trim() || session.participants[body.role].label,
  })

  sendJson(res, 200, { ok: true })
}

async function postSignal(req, res, _context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const body = await readJsonBody(req)
  if (!validateRoleToken(session, body.fromRole, body.token)) {
    sendJson(res, 403, { error: 'Invalid signaling token.' })
    return
  }

  if (!body.toRole || !body.type) {
    sendJson(res, 400, { error: 'toRole and type are required.' })
    return
  }

  // Host control messages mirror recording state before the peer receives them.
  if (body.type === 'control' && body.fromRole === 'host') {
    updateRecordingState(
      session,
      body.payload?.action === 'start-recording' ? 'recording' : 'stopped',
    )
  }

  enqueueSignal(session, {
    type: body.type,
    fromRole: body.fromRole,
    toRole: body.toRole,
    payload: body.payload || null,
  })

  sendJson(res, 201, { ok: true })
}

async function getSignals(req, res, context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const role = context.searchParams.get('role')
  const token = context.searchParams.get('token')
  const cursor = Number(context.searchParams.get('cursor') || '0')

  if (!validateRoleToken(session, role, token)) {
    sendJson(res, 403, { error: 'Invalid signaling token.' })
    return
  }

  const signals = listSignalsForRole(session, role, cursor)
  sendJson(res, 200, {
    cursor: signals.length ? signals[signals.length - 1].id : cursor,
    signals,
  })
}

async function uploadRecordingAction(req, res, context, params) {
  const session = ensureSession(params.sessionId, res)
  if (!session) {
    return
  }

  const role = context.searchParams.get('role')
  const token = context.searchParams.get('token')
  const track = context.searchParams.get('track')

  if (!validateRoleToken(session, role, token)) {
    sendJson(res, 403, { error: 'Invalid upload token.' })
    return
  }

  if (!['host', 'guest', 'mixed'].includes(track)) {
    sendJson(res, 400, { error: 'Invalid track requested.' })
    return
  }

  // Isolated tracks can only be uploaded by their owner; mixed audio is host-only.
  if (
    (track === 'host' && role !== 'host') ||
    (track === 'guest' && role !== 'guest') ||
    (track === 'mixed' && role !== 'host')
  ) {
    sendJson(res, 403, { error: 'You cannot upload this track.' })
    return
  }

  const buffer = await collectRequest(req)
  if (!buffer.length) {
    sendJson(res, 400, { error: 'Recording payload is empty.' })
    return
  }

  const recording = await saveRecording(session, track, buffer, req.headers['content-type'])
  sendJson(res, 201, recording)
}

async function downloadRecording(req, res, _context, params) {
  const cloudRecording = getRecordingByFileName(params.sessionId, params.fileName)
  if (cloudRecording?.url && /^https?:\/\//i.test(cloudRecording.url)) {
    res.writeHead(302, {
      Location: cloudRecording.url,
      'Access-Control-Allow-Origin': '*',
    })
    res.end()
    return
  }

  const filePath = getRecordingPath(params.sessionId, params.fileName)
  if (!fs.existsSync(filePath)) {
    sendText(res, 404, 'Recording not found.')
    return
  }

  const extension = path.extname(filePath).toLowerCase()
  const contentType = extension === '.ogg' ? 'audio/ogg' : 'audio/webm'
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
  })
  fs.createReadStream(filePath).pipe(res)
}

module.exports = {
  listSessions,
  createSessionAction,
  getAssignedScript,
  getNextSessionScript,
  getSession,
  joinParticipant,
  pingParticipant,
  postSignal,
  getSignals,
  uploadRecordingAction,
  downloadRecording,
}
