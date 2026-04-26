const fs = require('fs')
const path = require('path')
const { createId } = require('../lib/auth')
const { deleteAudio, uploadAudio } = require('../lib/cloudinary')
const { getCollection, stripMongoId } = require('../lib/database')

const STORAGE_DIR = path.join(__dirname, '..', 'storage')
const RECORDINGS_DIR = path.join(STORAGE_DIR, 'recordings')
const DEFAULT_APP_ORIGIN = 'https://dualrecording.vercel.app'

fs.mkdirSync(RECORDINGS_DIR, { recursive: true })

const sessions = new Map()

function normalizeAppOrigin(appOrigin) {
  if (!appOrigin || /^http:\/\/localhost:5173\/?$/i.test(appOrigin)) {
    return DEFAULT_APP_ORIGIN
  }

  return appOrigin.replace(/\/$/, '')
}

async function initializeSessions() {
  const collection = getCollection('sessions')
  if (!collection) {
    return
  }

  const documents = await collection.find({}).toArray()
  sessions.clear()
  documents.map(stripMongoId).forEach((session) => {
    sessions.set(session.id, {
      ...session,
      signals: [],
      nextSignalId: 1,
    })
  })
}

function persistSessions() {
  const collection = getCollection('sessions')
  if (!collection) {
    throw new Error('MongoDB sessions collection is not initialized.')
  }

  // Do not persist WebRTC signaling messages; only durable session data belongs in MongoDB.
  for (const { signals, nextSignalId, ...session } of sessions.values()) {
    collection.replaceOne({ id: session.id }, session, { upsert: true }).catch((error) => {
      console.error('Failed to persist session to MongoDB:', error)
    })
  }
}

function createSession(payload = {}, requestOrigin, owner) {
  const id = createId(6)
  const hostToken = createId(12)
  const guestToken = createId(12)
  const adminToken = createId(12)
  const appOrigin = normalizeAppOrigin(process.env.APP_ORIGIN || requestOrigin)

  const session = {
    id,
    title: payload.title?.trim() || `Podcast Session ${id.slice(0, 4).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    appOrigin,
    ownerUserId: owner.id,
    ownerName: owner.name,
    ownerEmail: owner.email,
    ownerMobile: owner.mobile,
    ownerVendorId: owner.vendorId || '',
    ownerVendorCode: owner.vendorCode || '',
    scriptId: payload.scriptId || '',
    scriptTitle: payload.scriptTitle || '',
    scriptText: payload.scriptText || '',
    adminToken,
    hostToken,
    guestToken,
    participants: {
      host: {
        role: 'host',
        label: payload.hostLabel?.trim() || 'Speaker 1',
        joinedAt: null,
        joined: false,
        lastSeenAt: null,
      },
      guest: {
        role: 'guest',
        label: payload.guestLabel?.trim() || 'Speaker 2',
        joinedAt: null,
        joined: false,
        lastSeenAt: null,
      },
    },
    recordingState: 'idle',
    recordings: {
      host: null,
      guest: null,
      mixed: null,
    },
    signals: [],
    nextSignalId: 1,
  }

  sessions.set(id, session)
  persistSessions()
  return session
}

function getSessionById(id) {
  return sessions.get(id) || null
}

function listSessionsByOwner(ownerUserId) {
  return [...sessions.values()]
    .filter((session) => session.ownerUserId === ownerUserId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function listAllSessions() {
  return [...sessions.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function getSessionCount() {
  return sessions.size
}

function buildLinks(session) {
  // Role-specific tokens make invite URLs enough to join the correct studio side.
  const base = normalizeAppOrigin(session.appOrigin)
  return {
    admin: `${base}/?admin=${session.adminToken}`,
    host: `${base}/?session=${session.id}&role=host&token=${session.hostToken}`,
    guest: `${base}/?session=${session.id}&role=guest&token=${session.guestToken}`,
  }
}

function toPublicSession(session) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    ownerName: session.ownerName,
    ownerUserId: session.ownerUserId,
    ownerEmail: session.ownerEmail || '',
    ownerMobile: session.ownerMobile || '',
    ownerVendorId: session.ownerVendorId || '',
    ownerVendorCode: session.ownerVendorCode || '',
    scriptId: session.scriptId || '',
    scriptTitle: session.scriptTitle || '',
    scriptText: session.scriptText || '',
    recordingState: session.recordingState,
    participants: session.participants,
    recordings: session.recordings,
    links: buildLinks(session),
  }
}

function validateRoleToken(session, role, token) {
  if (!session || !role || !token) {
    return false
  }

  if (role === 'host') {
    return token === session.hostToken
  }

  if (role === 'guest') {
    return token === session.guestToken
  }

  if (role === 'admin') {
    return token === session.adminToken
  }

  return false
}

function updateParticipant(session, role, patch) {
  session.participants[role] = {
    ...session.participants[role],
    ...patch,
  }
  sessions.set(session.id, session)
  persistSessions()
  return session
}

function enqueueSignal(session, signal) {
  // Polling clients use monotonically increasing IDs as cursors.
  session.signals.push({
    id: session.nextSignalId++,
    createdAt: Date.now(),
    ...signal,
  })
  return session
}

function listSignalsForRole(session, role, cursor) {
  return session.signals.filter((signal) => signal.id > cursor && signal.toRole === role)
}

function updateRecordingState(session, nextState) {
  session.recordingState = nextState
  sessions.set(session.id, session)
  persistSessions()
  return session
}

async function saveRecording(session, track, buffer, contentType) {
  // Each browser upload replaces the latest Cloudinary asset for that track.
  const extension = contentType?.includes('ogg') ? 'ogg' : 'webm'
  const fileName = `${track}.${extension}`
  const publicId = `${session.id}-${track}`
  const uploadResult = await uploadAudio(buffer, {
    folder: `dualrecord/${session.id}`,
    publicId,
    contentType,
  })

  session.recordings[track] = {
    track,
    uploadedAt: new Date().toISOString(),
    size: buffer.length,
    contentType: contentType || 'audio/webm',
    fileName,
    publicId: uploadResult.public_id,
    url: uploadResult.secure_url,
  }

  const allTracksUploaded = ['host', 'guest', 'mixed'].every(
    (key) => session.recordings[key],
  )
  if (allTracksUploaded) {
    session.recordingState = 'ready'
  }

  sessions.set(session.id, session)
  persistSessions()
  return session.recordings[track]
}

function getRecordingPath(sessionId, fileName) {
  return path.join(RECORDINGS_DIR, sessionId, fileName)
}

function getRecordingByFileName(sessionId, fileName) {
  const session = getSessionById(sessionId)
  if (!session) {
    return null
  }

  return Object.values(session.recordings).find(
    (recording) => recording?.fileName === fileName,
  )
}

async function deleteRecording(session, track) {
  if (!session?.recordings?.[track]) {
    return null
  }

  const recording = session.recordings[track]
  await deleteAudio(recording.publicId)
  deleteLocalRecordingFile(session.id, recording.fileName)
  session.recordings[track] = null

  if (session.recordingState === 'ready') {
    session.recordingState = 'stopped'
  }

  sessions.set(session.id, session)
  persistSessions()
  return recording
}

function deleteLocalRecordingFile(sessionId, fileName) {
  if (!fileName) {
    return
  }

  const filePath = getRecordingPath(sessionId, fileName)
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true })
  }
}

function deleteLocalRecordingFolder(sessionId) {
  const folderPath = path.join(RECORDINGS_DIR, sessionId)
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true })
  }
}

async function deleteSession(sessionId) {
  const session = getSessionById(sessionId)
  if (!session) {
    return null
  }

  await Promise.all(
    Object.values(session.recordings || {})
      .filter(Boolean)
      .map((recording) => deleteAudio(recording.publicId)),
  )

  deleteLocalRecordingFolder(sessionId)
  sessions.delete(sessionId)

  const collection = getCollection('sessions')
  if (collection) {
    await collection.deleteOne({ id: sessionId })
  }

  return session
}

async function deleteSessionsByOwner(ownerUserId) {
  const ownerSessions = [...sessions.values()].filter(
    (session) => session.ownerUserId === ownerUserId,
  )

  const deleted = []
  for (const session of ownerSessions) {
    const deletedSession = await deleteSession(session.id)
    if (deletedSession) {
      deleted.push(deletedSession)
    }
  }

  return deleted
}

module.exports = {
  initializeSessions,
  createSession,
  getSessionById,
  listSessionsByOwner,
  listAllSessions,
  getSessionCount,
  toPublicSession,
  validateRoleToken,
  updateParticipant,
  enqueueSignal,
  listSignalsForRole,
  updateRecordingState,
  saveRecording,
  deleteRecording,
  deleteSession,
  deleteSessionsByOwner,
  getRecordingPath,
  getRecordingByFileName,
}
