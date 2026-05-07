const adminController = require('../controllers/adminController')

module.exports = [
  {
    method: 'GET',
    path: '/api/admin/settings',
    handler: adminController.getAdminApiSettings,
  },
  {
    method: 'POST',
    path: '/api/admin/settings',
    handler: adminController.updateAdminApiSettings,
  },
  {
    method: 'GET',
    path: '/api/admin/api-settings',
    handler: adminController.getAdminApiSettings,
  },
  {
    method: 'POST',
    path: '/api/admin/api-settings',
    handler: adminController.updateAdminApiSettings,
  },
  {
    method: 'GET',
    path: '/api/admin/users',
    handler: adminController.listAdminUsers,
  },
  {
    method: 'POST',
    path: '/api/admin/users',
    handler: adminController.createAdminUser,
  },
  {
    method: 'POST',
    path: '/api/admin/users/bulk',
    handler: adminController.bulkCreateAdminUsers,
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/users\/([^/]+)$/,
    paramNames: ['userId'],
    handler: adminController.updateAdminUser,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/users\/([^/]+)$/,
    paramNames: ['userId'],
    handler: adminController.deleteAdminUser,
  },
  {
    method: 'GET',
    path: '/api/admin/vendors',
    handler: adminController.listAdminVendors,
  },
  {
    method: 'POST',
    path: '/api/admin/vendors',
    handler: adminController.createAdminVendor,
  },
  {
    method: 'POST',
    path: '/api/admin/vendors/bulk',
    handler: adminController.bulkCreateAdminVendors,
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/vendors\/([^/]+)$/,
    paramNames: ['vendorId'],
    handler: adminController.updateAdminVendor,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/vendors\/([^/]+)$/,
    paramNames: ['vendorId'],
    handler: adminController.deleteAdminVendor,
  },
  {
    method: 'GET',
    path: '/api/admin/scripts',
    handler: adminController.listAdminScripts,
  },
  {
    method: 'POST',
    path: '/api/admin/scripts',
    handler: adminController.createAdminScript,
  },
  {
    method: 'POST',
    path: '/api/admin/scripts/bulk',
    handler: adminController.bulkCreateAdminScripts,
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/scripts\/([^/]+)$/,
    paramNames: ['scriptId'],
    handler: adminController.updateAdminScript,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/scripts\/([^/]+)$/,
    paramNames: ['scriptId'],
    handler: adminController.deleteAdminScript,
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/sessions\/([^/]+)\/recordings\/([^/]+)$/,
    paramNames: ['sessionId', 'track'],
    handler: adminController.deleteAdminRecording,
  },
]
