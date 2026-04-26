const sessionController = require('../controllers/sessionController')

// Session routes include owner APIs, studio signaling, and recording downloads.
module.exports = [
  {
    method: 'GET',
    path: '/api/sessions',
    handler: sessionController.listSessions,
  },
  {
    method: 'POST',
    path: '/api/sessions',
    handler: sessionController.createSessionAction,
  },
  {
    method: 'GET',
    path: '/api/scripts/assigned',
    handler: sessionController.getAssignedScript,
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)\/scripts\/next$/,
    paramNames: ['sessionId'],
    handler: sessionController.getNextSessionScript,
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)$/,
    paramNames: ['sessionId'],
    handler: sessionController.getSession,
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/participants\/join$/,
    paramNames: ['sessionId'],
    handler: sessionController.joinParticipant,
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/participants\/ping$/,
    paramNames: ['sessionId'],
    handler: sessionController.pingParticipant,
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/signals$/,
    paramNames: ['sessionId'],
    handler: sessionController.postSignal,
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)\/signals$/,
    paramNames: ['sessionId'],
    handler: sessionController.getSignals,
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/recordings$/,
    paramNames: ['sessionId'],
    handler: sessionController.uploadRecordingAction,
  },
  {
    method: 'GET',
    pattern: /^\/recordings\/([^/]+)\/([^/]+)$/,
    paramNames: ['sessionId', 'fileName'],
    handler: sessionController.downloadRecording,
  },
]
