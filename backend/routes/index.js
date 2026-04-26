const adminRoutes = require('./adminRoutes')
const authRoutes = require('./authRoutes')
const sessionRoutes = require('./sessionRoutes')
const systemRoutes = require('./systemRoutes')

// Route order is explicit and flat so server.js can do one simple scan.
module.exports = [...systemRoutes, ...authRoutes, ...adminRoutes, ...sessionRoutes]
