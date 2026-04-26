const fs = require('fs')

// JSON files are loaded into Maps so model lookups stay simple and fast.
function loadMap(filePath, { key, transform = (value) => value }) {
  try {
    if (!fs.existsSync(filePath)) {
      return new Map()
    }

    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)

    return new Map(
      parsed.map((entry) => {
        const nextValue = transform(entry)
        return [nextValue[key], nextValue]
      }),
    )
  } catch (error) {
    console.error(`Failed to load ${filePath}:`, error)
    return new Map()
  }
}

function persistMap(filePath, collection, serialize = (value) => value) {
  // Persist as arrays because JSON has no native Map representation.
  const payload = [...collection.values()].map(serialize)
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

module.exports = {
  loadMap,
  persistMap,
}
