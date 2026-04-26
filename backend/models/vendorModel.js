const { createId } = require('../lib/auth')
const { getCollection, stripMongoId } = require('../lib/database')

const vendors = new Map()

function createVendorCode(name = '') {
  const prefix = String(name || 'vendor')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'V')
  return `${prefix}-${createId(3).toUpperCase()}`
}

async function initializeVendors() {
  const collection = getCollection('vendors')
  if (!collection) {
    return
  }

  const documents = await collection.find({}).toArray()
  vendors.clear()
  documents.map(stripMongoId).forEach((vendor) => {
    vendors.set(vendor.id, vendor)
  })
}

function persistVendor(vendor) {
  const collection = getCollection('vendors')
  if (!collection) {
    throw new Error('MongoDB vendors collection is not initialized.')
  }

  collection.replaceOne({ id: vendor.id }, vendor, { upsert: true }).catch((error) => {
    console.error('Failed to persist vendor to MongoDB:', error)
  })
}

function deleteVendorDocument(vendorId) {
  const collection = getCollection('vendors')
  if (collection) {
    collection.deleteOne({ id: vendorId }).catch((error) => {
      console.error('Failed to delete vendor from MongoDB:', error)
    })
  }
}

function listVendors() {
  return [...vendors.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

function getVendorById(id) {
  return vendors.get(id) || null
}

function createVendor({ name, email = '', mobile = '' }) {
  const vendor = {
    id: createId(8),
    code: createVendorCode(name),
    name: String(name || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    mobile: String(mobile || '').replace(/\D/g, ''),
    status: 'active',
    profile: {
      companyName: String(name || '').trim(),
      address: '',
      contactPerson: String(name || '').trim(),
      notes: '',
    },
    createdAt: new Date().toISOString(),
  }

  vendors.set(vendor.id, vendor)
  persistVendor(vendor)
  return vendor
}

function updateVendor(vendorId, patch = {}) {
  const vendor = getVendorById(vendorId)
  if (!vendor) {
    return null
  }

  const nextVendor = {
    ...vendor,
    name: patch.name !== undefined ? String(patch.name || '').trim() : vendor.name,
    email:
      patch.email !== undefined ? String(patch.email || '').trim().toLowerCase() : vendor.email,
    mobile:
      patch.mobile !== undefined ? String(patch.mobile || '').replace(/\D/g, '') : vendor.mobile,
    status:
      patch.status !== undefined
        ? ['inactive', 'suspended'].includes(patch.status)
          ? patch.status
          : 'active'
        : ['inactive', 'suspended'].includes(vendor.status)
          ? vendor.status
          : 'active',
    profile: {
      ...(vendor.profile || {}),
      ...(patch.profile || {}),
    },
  }

  vendors.set(vendorId, nextVendor)
  persistVendor(nextVendor)
  return nextVendor
}

function deleteVendor(vendorId) {
  const vendor = getVendorById(vendorId)
  if (!vendor) {
    return null
  }

  vendors.delete(vendorId)
  deleteVendorDocument(vendorId)
  return vendor
}

module.exports = {
  initializeVendors,
  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
}
