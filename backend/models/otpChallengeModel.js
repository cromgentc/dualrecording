const { createId, createOtp } = require('../lib/auth')
const { getCollection, stripMongoId } = require('../lib/database')

const OTP_TTL_MS = 10 * 60 * 1000

// Recovery challenges hold one short-lived OTP and later a reset token.
const otpChallenges = new Map()

async function initializeOtpChallenges() {
  const collection = getCollection('otpChallenges')
  if (!collection) {
    return
  }

  const documents = await collection.find({}).toArray()
  otpChallenges.clear()
  documents.map(stripMongoId).forEach((challenge) => {
    otpChallenges.set(challenge.id, challenge)
  })
  cleanupExpiredChallenges()
}

function persistOtpChallenges() {
  const collection = getCollection('otpChallenges')
  if (!collection) {
    throw new Error('MongoDB otpChallenges collection is not initialized.')
  }

  for (const challenge of otpChallenges.values()) {
    collection.replaceOne({ id: challenge.id }, challenge, { upsert: true }).catch((error) => {
      console.error('Failed to persist OTP challenge to MongoDB:', error)
    })
  }
}

function cleanupExpiredChallenges() {
  // Remove expired or completed challenges opportunistically on normal requests.
  let changed = false
  const now = Date.now()

  for (const [challengeId, challenge] of otpChallenges.entries()) {
    const expiresAt = new Date(challenge.expiresAt).getTime()
    if (Number.isNaN(expiresAt) || expiresAt <= now || challenge.completedAt) {
      otpChallenges.delete(challengeId)
      changed = true
    }
  }

  if (changed) {
    persistOtpChallenges()
    const collection = getCollection('otpChallenges')
    if (collection) {
      collection
        .deleteMany({
          $or: [
            { expiresAt: { $lte: new Date(now).toISOString() } },
            { completedAt: { $ne: null } },
          ],
        })
        .catch((error) => {
          console.error('Failed to cleanup OTP challenges from MongoDB:', error)
        })
    }
  }
}

function clearUserChallenges(userId) {
  let changed = false

  for (const [challengeId, challenge] of otpChallenges.entries()) {
    if (challenge.userId === userId) {
      otpChallenges.delete(challengeId)
      changed = true
    }
  }

  if (changed) {
    persistOtpChallenges()
    const collection = getCollection('otpChallenges')
    if (collection) {
      collection.deleteMany({ userId }).catch((error) => {
        console.error('Failed to delete user OTP challenges from MongoDB:', error)
      })
    }
  }
}

function createChallenge(user, channel) {
  // Keep only one active recovery flow per user to avoid stale OTP confusion.
  cleanupExpiredChallenges()
  clearUserChallenges(user.id)

  const challenge = {
    id: createId(10),
    userId: user.id,
    channel,
    target: channel === 'mobile' ? user.mobile : user.email,
    email: user.email,
    mobile: user.mobile,
    otp: createOtp(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    verifiedAt: null,
    resetToken: null,
    completedAt: null,
  }

  otpChallenges.set(challenge.id, challenge)
  persistOtpChallenges()

  console.log(
    `[OTP Preview] Recovery ${challenge.id} | channel: ${challenge.channel} | otp: ${challenge.otp}`,
  )

  return challenge
}

function getChallenge(id) {
  return otpChallenges.get(id) || null
}

function saveChallenge(challenge) {
  otpChallenges.set(challenge.id, challenge)
  persistOtpChallenges()
  return challenge
}

function deleteChallenge(id) {
  if (!otpChallenges.has(id)) {
    return false
  }

  otpChallenges.delete(id)
  persistOtpChallenges()
  const collection = getCollection('otpChallenges')
  if (collection) {
    collection.deleteOne({ id }).catch((error) => {
      console.error('Failed to delete OTP challenge from MongoDB:', error)
    })
  }
  return true
}

function isChallengeExpired(challenge) {
  return new Date(challenge.expiresAt).getTime() <= Date.now()
}

function getDevOtpPreview(challenge) {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  return {
    channel: challenge.channel,
    otp: challenge.otp,
  }
}

module.exports = {
  initializeOtpChallenges,
  createChallenge,
  getChallenge,
  saveChallenge,
  deleteChallenge,
  isChallengeExpired,
  cleanupExpiredChallenges,
  getDevOtpPreview,
}
