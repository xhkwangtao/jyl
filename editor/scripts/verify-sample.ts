import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseKmzArrayBuffer } from '../src/lib/kmz'

async function main(): Promise<void> {
  const kmzPath = resolve(process.cwd(), '../docs/tracks/2026-03-10 09 45 15.kmz')
  const data = await readFile(kmzPath)
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const document = await parseKmzArrayBuffer(arrayBuffer, '2026-03-10 09 45 15.kmz', {
    createObjectUrls: false
  })

  if (!document.route.pathGcj02.length) {
    throw new Error('Route points are missing.')
  }

  if (!document.pois.length) {
    throw new Error('POI points are missing.')
  }

  const photoCount = document.pois.reduce((count, poi) => count + poi.photos.length, 0)
  if (!photoCount) {
    throw new Error('Photo markers were not parsed.')
  }

  console.log(`route_points=${document.route.pathGcj02.length}`)
  console.log(`poi_count=${document.pois.length}`)
  console.log(`photo_count=${photoCount}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
