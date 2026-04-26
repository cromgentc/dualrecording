let cloudinary

try {
  ;({ v2: cloudinary } = require('cloudinary'))
} catch {
  cloudinary = null
}

function hasCloudinaryConfig() {
  return Boolean(
    cloudinary &&
      process.env.CLOUD_NAME &&
      process.env.API_KEY &&
      process.env.API_SECRET,
  )
}

function configureCloudinary() {
  if (!cloudinary) {
    return false
  }

  if (!hasCloudinaryConfig()) {
    return false
  }

  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
  })
  return true
}

function uploadAudio(buffer, { folder, publicId, contentType }) {
  if (!configureCloudinary()) {
    return Promise.reject(
      new Error('Cloudinary credentials missing. Set CLOUD_NAME, API_KEY, and API_SECRET.'),
    )
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'video',
        type: 'upload',
        context: contentType ? { contentType } : undefined,
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve(result)
      },
    )

    uploadStream.end(buffer)
  })
}

function deleteAudio(publicId) {
  if (!publicId || !configureCloudinary()) {
    return Promise.resolve()
  }

  return cloudinary.uploader.destroy(publicId, { resource_type: 'video' })
}

module.exports = {
  deleteAudio,
  uploadAudio,
}
