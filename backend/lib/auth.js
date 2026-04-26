const crypto = require('crypto')

function createId(length = 12) {
  return crypto.randomBytes(length).toString('hex')
}

function createOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '')
}

function isValidMobile(mobile) {
  return mobile.length >= 10 && mobile.length <= 15
}

function hashPassword(password) {
  // Store salt and hash together so verification can recreate the same scrypt hash.
  const salt = createId(16)
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, passwordHash) {
  const [salt, expectedHash] = String(passwordHash || '').split(':')
  if (!salt || !expectedHash) {
    return false
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString('hex')
  // timingSafeEqual avoids leaking partial password-match timing information.
  return crypto.timingSafeEqual(
    Buffer.from(actualHash, 'hex'),
    Buffer.from(expectedHash, 'hex'),
  )
}

module.exports = {
  createId,
  createOtp,
  normalizeEmail,
  normalizeMobile,
  isValidMobile,
  hashPassword,
  verifyPassword,
}
