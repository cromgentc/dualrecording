const { createId } = require('../lib/auth')
const { getCollection, stripMongoId } = require('../lib/database')

const authSessions = new Map()

async function initializeAuthSessions() {
  const collection = getCollection('authSessions')
  if (!collection) {
    return
  }

  const documents = await collection.find({}).toArray()
  authSessions.clear()
  documents.map(stripMongoId).forEach((authSession) => {
    authSessions.set(authSession.token, authSession)
  })
}

function persistAuthSessions() {
  const collection = getCollection('authSessions')
  if (!collection) {
    throw new Error('MongoDB authSessions collection is not initialized.')
  }

  for (const authSession of authSessions.values()) {
    collection
      .replaceOne({ token: authSession.token }, authSession, { upsert: true })
      .catch((error) => {
        console.error('Failed to persist auth session to MongoDB:', error)
      })
  }
}

function createAuthSession(userId) {
  const authSession = {
    token: createId(24),
    userId,
    createdAt: new Date().toISOString(),
  }

  authSessions.set(authSession.token, authSession)
  persistAuthSessions()
  return authSession
}

function getAuthSession(token) {
  return authSessions.get(token) || null
}

function deleteAuthSession(token) {
  if (!authSessions.has(token)) {
    return false
  }

  authSessions.delete(token)
  persistAuthSessions()
  const collection = getCollection('authSessions')
  if (collection) {
    collection.deleteOne({ token }).catch((error) => {
      console.error('Failed to delete auth session from MongoDB:', error)
    })
  }
  return true
}

function dropAuthSessionsForUser(userId) {
  // Password reset invalidates every existing login for that user.
  let changed = false

  for (const [token, authSession] of authSessions.entries()) {
    if (authSession.userId === userId) {
      authSessions.delete(token)
      changed = true
    }
  }

  if (changed) {
    persistAuthSessions()
    const collection = getCollection('authSessions')
    if (collection) {
      collection.deleteMany({ userId }).catch((error) => {
        console.error('Failed to delete user auth sessions from MongoDB:', error)
      })
    }
  }
}

module.exports = {
  initializeAuthSessions,
  createAuthSession,
  getAuthSession,
  deleteAuthSession,
  dropAuthSessionsForUser,
}
