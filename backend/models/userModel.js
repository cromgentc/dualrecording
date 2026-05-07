const { getCollection, stripMongoId } = require('../lib/database')
const {
  createId,
  hashPassword,
  normalizeEmail,
  normalizeMobile,
} = require('../lib/auth')

const users = new Map()

function normalizeScriptMode(value) {
  return value === 'non-script' ? 'non-script' : 'script'
}

async function initializeUsers() {
  const collection = getCollection('users')
  if (!collection) {
    return
  }

  const documents = await collection.find({}).toArray()
  users.clear()
  documents.map(stripMongoId).forEach((user) => {
    const normalizedUser = {
      ...user,
      mobile: normalizeMobile(user.mobile),
      role: ['admin', 'vendor'].includes(user.role) ? user.role : 'user',
      status: ['inactive', 'suspended'].includes(user.status) ? user.status : 'active',
      vendorCode: String(user.vendorCode || '').trim(),
      scriptMode: normalizeScriptMode(user.scriptMode),
    }
    users.set(normalizedUser.id, normalizedUser)
  })
}

function persistUsers() {
  const collection = getCollection('users')
  if (!collection) {
    throw new Error('MongoDB users collection is not initialized.')
  }

  for (const user of users.values()) {
    collection.replaceOne({ id: user.id }, user, { upsert: true }).catch((error) => {
      console.error('Failed to persist user to MongoDB:', error)
    })
  }
}

function getAllUsers() {
  return users
}

function getUserById(id) {
  return users.get(id) || null
}

function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email)

  for (const user of users.values()) {
    if (user.email === normalizedEmail) {
      return user
    }
  }

  return null
}

function getUserByMobile(mobile) {
  const normalizedMobile = normalizeMobile(mobile)

  for (const user of users.values()) {
    if (user.mobile === normalizedMobile) {
      return user
    }
  }

  return null
}

function getUserByIdentifier(identifier) {
  // Login accepts either email or mobile, chosen by the presence of @.
  const value = String(identifier || '').trim()
  if (!value) {
    return null
  }

  if (value.includes('@')) {
    return getUserByEmail(value)
  }

  return getUserByMobile(value)
}

function createUser({
  name,
  email,
  mobile,
  password,
  role = 'user',
  vendorId = '',
  vendorCode = '',
  scriptMode = 'script',
}) {
  const user = {
    id: createId(8),
    name: String(name || '').trim(),
    email: normalizeEmail(email),
    mobile: normalizeMobile(mobile),
    passwordHash: hashPassword(password),
    role: ['admin', 'vendor'].includes(role) ? role : 'user',
    status: 'active',
    vendorId: String(vendorId || '').trim(),
    vendorCode: String(vendorCode || '').trim(),
    scriptMode: normalizeScriptMode(scriptMode),
    createdAt: new Date().toISOString(),
  }

  users.set(user.id, user)
  persistUsers()
  return user
}

function updateUser(userId, patch) {
  const user = getUserById(userId)
  if (!user) {
    return null
  }

  const nextUser = {
    ...user,
    ...patch,
    email: patch.email !== undefined ? normalizeEmail(patch.email) : user.email,
    mobile: patch.mobile !== undefined ? normalizeMobile(patch.mobile) : user.mobile,
    role:
      patch.role !== undefined
        ? ['admin', 'vendor'].includes(patch.role)
          ? patch.role
          : 'user'
        : ['admin', 'vendor'].includes(user.role)
          ? user.role
          : 'user',
    status:
      patch.status !== undefined
        ? ['inactive', 'suspended'].includes(patch.status)
          ? patch.status
          : 'active'
        : ['inactive', 'suspended'].includes(user.status)
          ? user.status
          : 'active',
    vendorId: patch.vendorId !== undefined ? String(patch.vendorId || '').trim() : user.vendorId || '',
    vendorCode:
      patch.vendorCode !== undefined ? String(patch.vendorCode || '').trim() : user.vendorCode || '',
    scriptMode:
      patch.scriptMode !== undefined ? normalizeScriptMode(patch.scriptMode) : normalizeScriptMode(user.scriptMode),
  }

  users.set(userId, nextUser)
  persistUsers()
  return nextUser
}

function updateUserPassword(userId, newPassword) {
  const user = getUserById(userId)
  if (!user) {
    return null
  }

  user.passwordHash = hashPassword(newPassword)
  users.set(user.id, user)
  persistUsers()
  return user
}

function deleteUser(userId) {
  const user = getUserById(userId)
  if (!user) {
    return null
  }

  users.delete(userId)
  const collection = getCollection('users')
  if (collection) {
    collection.deleteOne({ id: userId }).catch((error) => {
      console.error('Failed to delete user from MongoDB:', error)
    })
  }
  return user
}

function toPublicUser(user) {
  // Never send passwordHash or other private fields to the frontend.
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: ['admin', 'vendor'].includes(user.role) ? user.role : 'user',
    status: ['inactive', 'suspended'].includes(user.status) ? user.status : 'active',
    vendorId: user.vendorId || '',
    vendorCode: user.vendorCode || '',
    scriptMode: normalizeScriptMode(user.scriptMode),
    createdAt: user.createdAt,
  }
}

module.exports = {
  initializeUsers,
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUserByMobile,
  getUserByIdentifier,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  toPublicUser,
}
