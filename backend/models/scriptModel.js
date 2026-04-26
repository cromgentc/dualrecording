const { createId, normalizeEmail, normalizeMobile } = require('../lib/auth')
const { getCollection, stripMongoId } = require('../lib/database')

const scripts = new Map()

async function initializeScripts() {
  const collection = getCollection('scripts')
  if (!collection) {
    return
  }

  const documents = await collection.find({}).toArray()
  scripts.clear()
  documents.map(stripMongoId).forEach((script) => {
    scripts.set(script.id, {
      ...script,
      email: normalizeEmail(script.email),
      mobile: normalizeMobile(script.mobile),
      speaker1Label: String(script.speaker1Label || 'Speaker 1').trim(),
      speaker2Label: String(script.speaker2Label || 'Speaker 2').trim(),
    })
  })
}

function persistScript(script) {
  const collection = getCollection('scripts')
  if (!collection) {
    throw new Error('MongoDB scripts collection is not initialized.')
  }

  collection.replaceOne({ id: script.id }, script, { upsert: true }).catch((error) => {
    console.error('Failed to persist script to MongoDB:', error)
  })
}

function listScripts() {
  return [...scripts.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function createScript({
  title,
  email = '',
  mobile = '',
  speaker1Label = 'Speaker 1',
  speaker2Label = 'Speaker 2',
  script = '',
}) {
  const nextScript = {
    id: createId(8),
    title: String(title || '').trim() || 'Untitled Script',
    email: normalizeEmail(email),
    mobile: normalizeMobile(mobile),
    speaker1Label: String(speaker1Label || 'Speaker 1').trim(),
    speaker2Label: String(speaker2Label || 'Speaker 2').trim(),
    script: String(script || '').trim(),
    createdAt: new Date().toISOString(),
  }

  scripts.set(nextScript.id, nextScript)
  persistScript(nextScript)
  return nextScript
}

function getScriptById(scriptId) {
  return scripts.get(scriptId) || null
}

function updateScript(scriptId, patch = {}) {
  const script = getScriptById(scriptId)
  if (!script) {
    return null
  }

  const nextScript = {
    ...script,
    title:
      patch.title !== undefined
        ? String(patch.title || '').trim() || 'Untitled Script'
        : script.title,
    email: patch.email !== undefined ? normalizeEmail(patch.email) : script.email,
    mobile: patch.mobile !== undefined ? normalizeMobile(patch.mobile) : script.mobile,
    speaker1Label:
      patch.speaker1Label !== undefined
        ? String(patch.speaker1Label || 'Speaker 1').trim()
        : script.speaker1Label || 'Speaker 1',
    speaker2Label:
      patch.speaker2Label !== undefined
        ? String(patch.speaker2Label || 'Speaker 2').trim()
        : script.speaker2Label || 'Speaker 2',
    script:
      patch.script !== undefined ? String(patch.script || '').trim() : script.script,
    updatedAt: new Date().toISOString(),
  }

  scripts.set(scriptId, nextScript)
  persistScript(nextScript)
  return nextScript
}

function deleteScript(scriptId) {
  const script = getScriptById(scriptId)
  if (!script) {
    return null
  }

  scripts.delete(scriptId)
  const collection = getCollection('scripts')
  if (collection) {
    collection.deleteOne({ id: scriptId }).catch((error) => {
      console.error('Failed to delete script from MongoDB:', error)
    })
  }
  return script
}

function findScriptForUser(user) {
  const email = normalizeEmail(user?.email)
  const mobile = normalizeMobile(user?.mobile)

  return (
    listScripts().find(
      (script) =>
        (email && script.email === email) || (mobile && script.mobile === mobile),
    ) || null
  )
}

function listScriptsForUser(user) {
  const email = normalizeEmail(user?.email)
  const mobile = normalizeMobile(user?.mobile)

  return listScripts()
    .filter(
      (script) =>
        (email && script.email === email) || (mobile && script.mobile === mobile),
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

module.exports = {
  initializeScripts,
  listScripts,
  createScript,
  getScriptById,
  updateScript,
  deleteScript,
  findScriptForUser,
  listScriptsForUser,
}
