const { getCollection, stripMongoId } = require('../lib/database')

const SETTINGS_ID = 'cloudinary'
const apiSettings = {
  cloudName: process.env.CLOUD_NAME || '',
  apiKey: process.env.API_KEY || '',
  apiSecret: process.env.API_SECRET || '',
  updatedAt: '',
}

function applyCloudinaryEnv(settings = apiSettings) {
  if (settings.cloudName) {
    process.env.CLOUD_NAME = settings.cloudName
  }
  if (settings.apiKey) {
    process.env.API_KEY = settings.apiKey
  }
  if (settings.apiSecret) {
    process.env.API_SECRET = settings.apiSecret
  }
}

function maskSecret(value) {
  const text = String(value || '')
  if (!text) {
    return ''
  }

  if (text.length <= 6) {
    return '*'.repeat(text.length)
  }

  return `${text.slice(0, 3)}${'*'.repeat(Math.max(4, text.length - 6))}${text.slice(-3)}`
}

async function initializeApiSettings() {
  const collection = getCollection('apiSettings')
  if (!collection) {
    applyCloudinaryEnv()
    return
  }

  const document = await collection.findOne({ id: SETTINGS_ID })
  if (document) {
    const settings = stripMongoId(document)
    apiSettings.cloudName = String(settings.cloudName || '').trim()
    apiSettings.apiKey = String(settings.apiKey || '').trim()
    apiSettings.apiSecret = String(settings.apiSecret || '').trim()
    apiSettings.updatedAt = settings.updatedAt || ''
  }

  applyCloudinaryEnv()
}

function getApiSettings({ masked = true } = {}) {
  return {
    cloudName: apiSettings.cloudName,
    apiKey: masked ? maskSecret(apiSettings.apiKey) : apiSettings.apiKey,
    apiSecret: masked ? maskSecret(apiSettings.apiSecret) : apiSettings.apiSecret,
    configured: Boolean(apiSettings.cloudName && apiSettings.apiKey && apiSettings.apiSecret),
    updatedAt: apiSettings.updatedAt,
  }
}

async function updateApiSettings(patch = {}) {
  if (patch.cloudName !== undefined) {
    apiSettings.cloudName = String(patch.cloudName || '').trim()
  }
  if (patch.apiKey !== undefined) {
    apiSettings.apiKey = String(patch.apiKey || '').trim()
  }
  if (patch.apiSecret !== undefined) {
    apiSettings.apiSecret = String(patch.apiSecret || '').trim()
  }
  apiSettings.updatedAt = new Date().toISOString()

  applyCloudinaryEnv()

  const collection = getCollection('apiSettings')
  if (collection) {
    await collection.replaceOne(
      { id: SETTINGS_ID },
      {
        id: SETTINGS_ID,
        cloudName: apiSettings.cloudName,
        apiKey: apiSettings.apiKey,
        apiSecret: apiSettings.apiSecret,
        updatedAt: apiSettings.updatedAt,
      },
      { upsert: true },
    )
  }

  return getApiSettings()
}

module.exports = {
  getApiSettings,
  initializeApiSettings,
  updateApiSettings,
}
