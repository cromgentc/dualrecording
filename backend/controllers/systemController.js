const { sendJson } = require('../lib/http')
const { getAllUsers } = require('../models/userModel')
const { listVendors } = require('../models/vendorModel')

function getApiEndpointCatalog(port) {
  // This endpoint doubles as a quick Postman guide for the local API.
  return {
    baseUrl: `http://localhost:${port}`,
    documentation: 'Use these endpoints directly in Postman with JSON request bodies.',
    endpoints: [
      {
        name: 'Health Check',
        method: 'GET',
        path: '/health',
        description: 'Server status check.',
      },
      {
        name: 'API Endpoint Catalog',
        method: 'GET',
        path: '/api/endpoints',
        description: 'Returns all important API endpoints and sample payloads.',
      },
      {
        name: 'Register User',
        method: 'POST',
        path: '/api/auth/register',
        description: 'Create a new user account.',
        body: {
          name: 'Demo User',
          email: 'demo@example.com',
          mobile: '9876543210',
          password: 'secret123',
        },
      },
      {
        name: 'Login User',
        method: 'POST',
        path: '/api/auth/login',
        description: 'Login using email or mobile.',
        body: {
          identifier: 'demo@example.com',
          password: 'secret123',
        },
      },
      {
        name: 'Forgot Password Request',
        method: 'POST',
        path: '/api/auth/forgot/request',
        description: 'Request OTP on selected channel.',
        body: {
          channel: 'email',
          email: 'demo@example.com',
        },
      },
      {
        name: 'Forgot Password Verify',
        method: 'POST',
        path: '/api/auth/forgot/verify',
        description: 'Verify OTP received on email or mobile.',
        body: {
          recoveryId: 'RECOVERY_ID',
          otp: '123456',
        },
      },
      {
        name: 'Forgot Password Reset',
        method: 'POST',
        path: '/api/auth/forgot/reset',
        description: 'Reset password after OTP verification.',
        body: {
          recoveryId: 'RECOVERY_ID',
          resetToken: 'RESET_TOKEN',
          newPassword: 'newsecret123',
        },
      },
      {
        name: 'Current User',
        method: 'GET',
        path: '/api/auth/me',
        description: 'Get logged in user profile.',
        headers: {
          Authorization: 'Bearer YOUR_TOKEN',
        },
      },
      {
        name: 'Create Session',
        method: 'POST',
        path: '/api/sessions',
        description: 'Create a new podcast recording session.',
        headers: {
          Authorization: 'Bearer YOUR_TOKEN',
        },
        body: {
          title: 'My Podcast Episode',
          hostLabel: 'Speaker 1',
          guestLabel: 'Speaker 2',
        },
      },
      {
        name: 'List Sessions',
        method: 'GET',
        path: '/api/sessions',
        description: 'Get all sessions for logged in user.',
        headers: {
          Authorization: 'Bearer YOUR_TOKEN',
        },
      },
    ],
  }
}

async function health(_req, res, context) {
  const users = [...getAllUsers().values()]
  const roleCounts = users.reduce(
    (counts, user) => ({
      ...counts,
      [user.role === 'admin' ? 'admin' : 'user']:
        counts[user.role === 'admin' ? 'admin' : 'user'] + 1,
    }),
    { admin: 0, user: 0 },
  )

  sendJson(res, 200, {
    ok: true,
    sessions: context.sessionCount(),
    users: users.length,
    vendors: listVendors().length,
    roleCounts,
  })
}

async function root(_req, res, context) {
  sendJson(res, 200, {
    ok: true,
    name: 'DualRecord API',
    message:
      'Backend is running. Open the frontend app URL to use the recording dashboard.',
    health: '/health',
    endpoints: '/api/endpoints',
    frontendUrl: process.env.APP_ORIGIN || '',
    baseUrl: `http://localhost:${context.port}`,
  })
}

async function endpoints(_req, res, context) {
  sendJson(res, 200, getApiEndpointCatalog(context.port))
}

module.exports = {
  root,
  health,
  endpoints,
  getApiEndpointCatalog,
}
