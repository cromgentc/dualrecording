const authController = require('../controllers/authController')

// Auth routes cover login, registration, password recovery, profile, and logout.
module.exports = [
  {
    method: 'POST',
    path: '/api/auth/register',
    handler: authController.register,
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    handler: authController.login,
  },
  {
    method: 'POST',
    path: '/api/auth/forgot/request',
    handler: authController.forgotRequest,
  },
  {
    method: 'POST',
    path: '/api/auth/forgot/verify',
    handler: authController.forgotVerify,
  },
  {
    method: 'POST',
    path: '/api/auth/forgot/reset',
    handler: authController.forgotReset,
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    handler: authController.me,
  },
  {
    method: 'POST',
    path: '/api/auth/profile',
    handler: authController.updateProfile,
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    handler: authController.logout,
  },
]
