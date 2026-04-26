const {
  isValidMobile,
  normalizeEmail,
  normalizeMobile,
  verifyPassword,
  createId,
} = require('../lib/auth')
const { readJsonBody, sendJson } = require('../lib/http')
const {
  getUserByEmail,
  getUserByMobile,
  getUserByIdentifier,
  createUser,
  updateUserPassword,
  updateUser,
  toPublicUser,
  getUserById,
} = require('../models/userModel')
const {
  createAuthSession,
  getAuthSession,
  deleteAuthSession,
  dropAuthSessionsForUser,
} = require('../models/authSessionModel')
const {
  createChallenge,
  getChallenge,
  saveChallenge,
  deleteChallenge,
  isChallengeExpired,
  getDevOtpPreview,
} = require('../models/otpChallengeModel')
const { getVendorById } = require('../models/vendorModel')

function getAuthToken(req) {
  // Bearer tokens are used by protected user/session endpoints.
  const authorization = req.headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length).trim()
}

function getAuthUser(req) {
  const token = getAuthToken(req)
  if (!token) {
    return null
  }

  const authSession = getAuthSession(token)
  if (!authSession) {
    return null
  }

  const user = getUserById(authSession.userId)
  if (!user) {
    return null
  }

  return {
    token,
    session: authSession,
    user,
  }
}

function requireAuth(req, res) {
  const auth = getAuthUser(req)
  if (!auth) {
    sendJson(res, 401, { error: 'Please login first.' })
    return null
  }

  return auth
}

async function register(req, res) {
  const body = await readJsonBody(req)
  const name = String(body.name || '').trim()
  const email = normalizeEmail(body.email)
  const mobile = normalizeMobile(body.mobile)
  const password = String(body.password || '')
  const role = body.role === 'admin' ? 'admin' : 'user'

  if (!name || !email || !isValidMobile(mobile) || password.length < 6) {
    sendJson(res, 400, {
      error:
        'Name, valid email, valid mobile number, and password with minimum 6 characters required.',
    })
    return
  }

  if (getUserByEmail(email)) {
    sendJson(res, 409, { error: 'Email already exists. Please login.' })
    return
  }

  if (getUserByMobile(mobile)) {
    sendJson(res, 409, { error: 'Mobile number already exists. Please login.' })
    return
  }

  const user = createUser({ name, email, mobile, password, role })
  const authSession = createAuthSession(user.id)

  sendJson(res, 201, {
    token: authSession.token,
    user: toPublicUser(user),
  })
}

async function login(req, res) {
  const body = await readJsonBody(req)
  const identifier = String(body.identifier || body.email || '').trim()
  const password = String(body.password || '')
  const user = getUserByIdentifier(identifier)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    sendJson(res, 401, { error: 'Invalid email/mobile or password.' })
    return
  }

  if (['inactive', 'suspended'].includes(user.status)) {
    sendJson(res, 403, { error: 'Your account is not active.' })
    return
  }

  if (user.role === 'vendor') {
    const vendor = getVendorById(user.vendorId)
    if (vendor && ['inactive', 'suspended'].includes(vendor.status)) {
      sendJson(res, 403, { error: 'Your vendor account is not active.' })
      return
    }
  }

  const authSession = createAuthSession(user.id)
  sendJson(res, 200, {
    token: authSession.token,
    user: toPublicUser(user),
  })
}

async function forgotRequest(req, res) {
  // The same recovery flow supports email and mobile identifiers.
  const body = await readJsonBody(req)
  const channel = body.channel === 'mobile' ? 'mobile' : 'email'
  const identifier =
    channel === 'mobile'
      ? normalizeMobile(body.mobile || body.identifier)
      : normalizeEmail(body.email || body.identifier)

  if (
    (channel === 'mobile' && !isValidMobile(identifier)) ||
    (channel === 'email' && !identifier)
  ) {
    sendJson(res, 400, {
      error:
        channel === 'mobile' ? 'Valid mobile number required.' : 'Valid email required.',
    })
    return
  }

  const user =
    channel === 'mobile' ? getUserByMobile(identifier) : getUserByEmail(identifier)

  if (!user) {
    sendJson(res, 404, {
      error:
        channel === 'mobile'
          ? 'Account with this mobile number not found.'
          : 'Account with this email not found.',
    })
    return
  }

  const challenge = createChallenge(user, channel)
  const response = {
    ok: true,
    recoveryId: challenge.id,
    channel: challenge.channel,
    expiresAt: challenge.expiresAt,
    message:
      channel === 'mobile' ? 'OTP sent to your mobile number.' : 'OTP sent to your email.',
  }

  const devOtpPreview = getDevOtpPreview(challenge)
  if (devOtpPreview) {
    response.devOtpPreview = devOtpPreview
  }

  sendJson(res, 200, response)
}

async function forgotVerify(req, res) {
  // Successful OTP verification issues a separate reset token for the final step.
  const body = await readJsonBody(req)
  const recoveryId = String(body.recoveryId || '').trim()
  const otp = String(body.otp || '').trim()
  const challenge = getChallenge(recoveryId)

  if (!challenge) {
    sendJson(res, 404, { error: 'Recovery request not found. Start again.' })
    return
  }

  if (isChallengeExpired(challenge)) {
    deleteChallenge(recoveryId)
    sendJson(res, 410, { error: 'OTP expired. Please request a new one.' })
    return
  }

  if (challenge.otp !== otp) {
    sendJson(res, 400, {
      error:
        challenge.channel === 'mobile' ? 'Invalid mobile OTP.' : 'Invalid email OTP.',
    })
    return
  }

  challenge.verifiedAt = new Date().toISOString()
  challenge.resetToken = createId(24)
  saveChallenge(challenge)

  sendJson(res, 200, {
    ok: true,
    recoveryId: challenge.id,
    channel: challenge.channel,
    resetToken: challenge.resetToken,
    message: 'OTP verified successfully.',
  })
}

async function forgotReset(req, res) {
  // Reset requires both the recovery id and reset token created during verification.
  const body = await readJsonBody(req)
  const recoveryId = String(body.recoveryId || '').trim()
  const resetToken = String(body.resetToken || '').trim()
  const newPassword = String(body.newPassword || '')
  const challenge = getChallenge(recoveryId)

  if (!challenge) {
    sendJson(res, 404, { error: 'Recovery request not found. Start again.' })
    return
  }

  if (isChallengeExpired(challenge)) {
    deleteChallenge(recoveryId)
    sendJson(res, 410, { error: 'Recovery session expired. Please request OTP again.' })
    return
  }

  if (!challenge.verifiedAt || challenge.resetToken !== resetToken) {
    sendJson(res, 403, { error: 'Please verify OTP before resetting password.' })
    return
  }

  if (newPassword.length < 6) {
    sendJson(res, 400, {
      error: 'New password must contain at least 6 characters.',
    })
    return
  }

  const user = updateUserPassword(challenge.userId, newPassword)
  if (!user) {
    deleteChallenge(recoveryId)
    sendJson(res, 404, { error: 'User no longer exists.' })
    return
  }

  dropAuthSessionsForUser(user.id)
  deleteChallenge(recoveryId)

  sendJson(res, 200, {
    ok: true,
    message: 'Password reset successful. Please login with your new password.',
  })
}

async function me(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return
  }

  sendJson(res, 200, { user: toPublicUser(auth.user) })
}

async function updateProfile(req, res) {
  const auth = requireAuth(req, res)
  if (!auth) {
    return
  }

  const body = await readJsonBody(req)
  const patch = {}
  if (body.name !== undefined) {
    patch.name = String(body.name || '').trim() || auth.user.name
  }
  if (body.email !== undefined) {
    patch.email = normalizeEmail(body.email) || auth.user.email
  }
  if (body.mobile !== undefined) {
    patch.mobile = normalizeMobile(body.mobile) || auth.user.mobile
  }

  const nextUser = updateUser(auth.user.id, patch)
  sendJson(res, 200, { user: toPublicUser(nextUser) })
}

async function logout(req, res) {
  const token = getAuthToken(req)
  if (token) {
    deleteAuthSession(token)
  }

  sendJson(res, 200, { ok: true })
}

module.exports = {
  getAuthUser,
  requireAuth,
  register,
  login,
  forgotRequest,
  forgotVerify,
  forgotReset,
  me,
  updateProfile,
  logout,
}
