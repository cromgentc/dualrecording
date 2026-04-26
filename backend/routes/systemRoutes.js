const systemController = require('../controllers/systemController')

// System routes are public diagnostics for health and endpoint discovery.
module.exports = [
  {
    method: 'GET',
    path: '/health',
    handler: systemController.health,
  },
  {
    method: 'GET',
    path: '/api/endpoints',
    handler: systemController.endpoints,
  },
]
