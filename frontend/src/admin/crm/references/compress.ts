/**
 * Shrinks a photo in the browser before upload: longest side ≤ 1600px, JPEG at ~80%.
 * A 4 MB phone photo usually becomes ~300 KB, which matters on mobile data.
 * Rotation from the camera's EXIF data is applied so portrait photos stay upright.
 */

const MAX_SIDE = 1600
const QUALITY = 0.8

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Older Safari: fall back to an <img>, which also honours EXIF orientation.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export async function compressImage(file: File): Promise<Blob> {
  let source: CanvasImageSource & { width: number; height: number }
  try {
    source = await decode(file)
  } catch {
    throw new Error(`Couldn't read “${file.name}”. Choose a JPEG or PNG photo.`)
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  if ('close' in source && typeof source.close === 'function') source.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new Error(`Couldn't process “${file.name}”.`)
  return blob
}
