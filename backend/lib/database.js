let MongoClient

try {
  ;({ MongoClient } = require('mongodb'))
} catch {
  MongoClient = null
}

let client = null
let database = null

async function connectDatabase() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI missing. Backend data storage requires MongoDB.')
  }

  if (!MongoClient) {
    throw new Error('mongodb package missing. Run npm install in backend folder.')
  }

  client = new MongoClient(process.env.MONGO_URI)
  await client.connect()
  database = client.db()
  console.log('MongoDB connected.')
  return database
}

function getCollection(name) {
  if (!database) {
    return null
  }

  return database.collection(name)
}

function stripMongoId(document) {
  if (!document) {
    return document
  }

  const { _id, ...rest } = document
  return rest
}

module.exports = {
  connectDatabase,
  getCollection,
  stripMongoId,
}
