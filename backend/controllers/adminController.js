const { readJsonBody, sendJson } = require('../lib/http')
const { isValidMobile, normalizeEmail, normalizeMobile } = require('../lib/auth')
const { requireAuth } = require('./authController')
const {
  createUser,
  deleteUser,
  getAllUsers,
  getUserByEmail,
  getUserByMobile,
  updateUser,
  toPublicUser,
} = require('../models/userModel')
const {
  createVendor,
  deleteVendor,
  getVendorById,
  listVendors,
  updateVendor,
} = require('../models/vendorModel')
const {
  deleteRecording,
  deleteSessionsByOwner,
  getSessionById,
  toPublicSession,
} = require('../models/sessionModel')
const { createScript, deleteScript, listScripts, updateScript } = require('../models/scriptModel')

function requireAdmin(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return null
  }

  if (auth.user.role !== 'admin') {
    sendJson(res, 403, { error: 'Admin access required.' })
    return null
  }

  return auth
}

function requireAdminOrVendor(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return null
  }

  if (!['admin', 'vendor'].includes(auth.user.role)) {
    sendJson(res, 403, { error: 'Admin or vendor access required.' })
    return null
  }

  return auth
}

async function listAdminUsers(req, res) {
  const auth = requireAdminOrVendor(req, res)
  if (!auth) {
    return
  }

  const users = [...getAllUsers().values()]
  const visibleUsers =
    auth.user.role === 'vendor'
      ? users.filter((user) => user.vendorId === auth.user.vendorId)
      : users
  sendJson(res, 200, visibleUsers.map(toPublicUser))
}

function createUserFromPayload(payload) {
  const name = String(payload.name || '').trim()
  const email = normalizeEmail(payload.email)
  const mobile = normalizeMobile(payload.mobile)
  const password = String(payload.password || '123456')
  const role = ['admin', 'vendor'].includes(payload.role) ? payload.role : 'user'
  const vendorId = String(payload.vendorId || '').trim()
  const vendor = vendorId ? getVendorById(vendorId) : null
  const vendorCode = vendor?.code || String(payload.vendorCode || '').trim()

  if (!name || !email || !isValidMobile(mobile) || password.length < 6) {
    return { error: 'Name, valid email, valid mobile, and 6 character password required.' }
  }

  if (getUserByEmail(email) || getUserByMobile(mobile)) {
    return { error: `Duplicate user skipped: ${email || mobile}` }
  }

  return {
    user: createUser({ name, email, mobile, password, role, vendorId, vendorCode }),
  }
}

async function createAdminUser(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  const result = createUserFromPayload(body)
  if (result.error) {
    sendJson(res, 400, { error: result.error })
    return
  }

  sendJson(res, 201, toPublicUser(result.user))
}

async function bulkCreateAdminUsers(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  const rows = Array.isArray(body.users) ? body.users : []
  const created = []
  const errors = []

  rows.forEach((row, index) => {
    const result = createUserFromPayload(row)
    if (result.error) {
      errors.push({ index: index + 1, error: result.error })
      return
    }
    created.push(toPublicUser(result.user))
  })

  sendJson(res, 200, { created, errors })
}

async function updateAdminUser(req, res, _context, params) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  const patch = {}

  if (body.vendorId !== undefined) {
    patch.vendorId = String(body.vendorId || '').trim()
    patch.vendorCode = patch.vendorId ? getVendorById(patch.vendorId)?.code || '' : ''
  }

  if (body.status !== undefined) {
    patch.status = ['inactive', 'suspended'].includes(body.status) ? body.status : 'active'
  }

  ;['name', 'email', 'mobile'].forEach((key) => {
    if (body[key] !== undefined) {
      patch[key] = String(body[key] || '').trim()
    }
  })

  if (body.role !== undefined) {
    patch.role = ['admin', 'vendor'].includes(body.role) ? body.role : 'user'
  }

  const user = updateUser(params.userId, patch)
  if (!user) {
    sendJson(res, 404, { error: 'User not found.' })
    return
  }

  sendJson(res, 200, toPublicUser(user))
}

async function deleteAdminUser(req, res, _context, params) {
  if (!requireAdmin(req, res)) {
    return
  }

  await deleteSessionsByOwner(params.userId)
  const deleted = deleteUser(params.userId)
  if (!deleted) {
    sendJson(res, 404, { error: 'User not found.' })
    return
  }

  sendJson(res, 200, { ok: true, user: toPublicUser(deleted) })
}

async function listAdminVendors(req, res) {
  const auth = requireAdminOrVendor(req, res)
  if (!auth) {
    return
  }

  const vendors =
    auth.user.role === 'vendor'
      ? listVendors().filter((vendor) => vendor.id === auth.user.vendorId)
      : listVendors()
  sendJson(res, 200, vendors)
}

async function createAdminVendor(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  const name = String(body.name || '').trim()
  if (!name) {
    sendJson(res, 400, { error: 'Vendor name required.' })
    return
  }

  const vendor = createVendor(body)
  if (body.email && body.mobile) {
    const existing = getUserByEmail(body.email) || getUserByMobile(body.mobile)
    if (!existing) {
      createUser({
        name,
        email: body.email,
        mobile: body.mobile,
        password: body.password || '123456',
        role: 'vendor',
        vendorId: vendor.id,
        vendorCode: vendor.code,
      })
    }
  }

  sendJson(res, 201, vendor)
}

async function bulkCreateAdminVendors(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  const rows = Array.isArray(body.vendors) ? body.vendors : []
  const created = []
  const errors = []

  rows.forEach((row, index) => {
    const name = String(row.name || '').trim()
    if (!name) {
      errors.push({ index: index + 1, error: 'Vendor name required.' })
      return
    }

    const vendor = createVendor(row)
    created.push(vendor)
    if (row.email && row.mobile && !getUserByEmail(row.email) && !getUserByMobile(row.mobile)) {
      createUser({
        name,
        email: row.email,
        mobile: row.mobile,
        password: row.password || '123456',
        role: 'vendor',
        vendorId: vendor.id,
        vendorCode: vendor.code,
      })
    }
  })

  sendJson(res, 200, { created, errors })
}

async function updateAdminVendor(req, res, _context, params) {
  const auth = requireAdminOrVendor(req, res)
  if (!auth) {
    return
  }

  if (auth.user.role === 'vendor' && auth.user.vendorId !== params.vendorId) {
    sendJson(res, 403, { error: 'You can update only your own vendor profile.' })
    return
  }

  const body = await readJsonBody(req)
  const patch =
    auth.user.role === 'vendor'
      ? {
          name: body.name,
          email: body.email,
          mobile: body.mobile,
          profile: body.profile,
        }
      : body
  const vendor = updateVendor(params.vendorId, patch)
  if (!vendor) {
    sendJson(res, 404, { error: 'Vendor not found.' })
    return
  }

  sendJson(res, 200, vendor)
}

async function deleteAdminVendor(req, res, _context, params) {
  if (!requireAdmin(req, res)) {
    return
  }

  const vendor = deleteVendor(params.vendorId)
  if (!vendor) {
    sendJson(res, 404, { error: 'Vendor not found.' })
    return
  }

  sendJson(res, 200, { ok: true, vendor })
}

async function listAdminScripts(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  sendJson(res, 200, listScripts())
}

async function createAdminScript(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  if (!String(body.email || body.mobile || '').trim() || !String(body.script || '').trim()) {
    sendJson(res, 400, { error: 'Email/mobile and script required.' })
    return
  }

  sendJson(res, 201, createScript(body))
}

async function bulkCreateAdminScripts(req, res) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  const rows = Array.isArray(body.scripts) ? body.scripts : []
  const created = []
  const errors = []
  rows.forEach((row, index) => {
    if (!String(row.email || row.mobile || '').trim() || !String(row.script || '').trim()) {
      errors.push({ index: index + 1, error: 'Email/mobile and script required.' })
      return
    }
    created.push(createScript(row))
  })

  sendJson(res, 200, { created, errors })
}

async function updateAdminScript(req, res, _context, params) {
  if (!requireAdmin(req, res)) {
    return
  }

  const body = await readJsonBody(req)
  if (!String(body.email || body.mobile || '').trim() || !String(body.script || '').trim()) {
    sendJson(res, 400, { error: 'Email/mobile and script required.' })
    return
  }

  const script = updateScript(params.scriptId, body)
  if (!script) {
    sendJson(res, 404, { error: 'Script not found.' })
    return
  }

  sendJson(res, 200, script)
}

async function deleteAdminScript(req, res, _context, params) {
  if (!requireAdmin(req, res)) {
    return
  }

  const script = deleteScript(params.scriptId)
  if (!script) {
    sendJson(res, 404, { error: 'Script not found.' })
    return
  }

  sendJson(res, 200, { ok: true, script })
}

async function deleteAdminRecording(req, res, _context, params) {
  if (!requireAdmin(req, res)) {
    return
  }

  const session = getSessionById(params.sessionId)
  if (!session) {
    sendJson(res, 404, { error: 'Session not found.' })
    return
  }

  if (!['host', 'guest', 'mixed'].includes(params.track)) {
    sendJson(res, 400, { error: 'Invalid recording track.' })
    return
  }

  const deleted = await deleteRecording(session, params.track)
  if (!deleted) {
    sendJson(res, 404, { error: 'Recording not found.' })
    return
  }

  sendJson(res, 200, { ok: true, session: toPublicSession(session) })
}

module.exports = {
  listAdminUsers,
  createAdminUser,
  bulkCreateAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  listAdminVendors,
  createAdminVendor,
  bulkCreateAdminVendors,
  updateAdminVendor,
  deleteAdminVendor,
  listAdminScripts,
  createAdminScript,
  bulkCreateAdminScripts,
  updateAdminScript,
  deleteAdminScript,
  deleteAdminRecording,
}
