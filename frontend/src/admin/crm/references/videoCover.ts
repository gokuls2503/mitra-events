/**
 * Takes a frame from near the start of a video as a JPEG, for its thumbnail.
 * Returns null if this browser can't play the video (e.g. some iPhone HEVC files on a computer);
 * the video still uploads and shows a plain play icon instead.
 */

const MAX_SIDE = 1600

function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    video.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true })
    video.addEventListener('error', () => (clearTimeout(timer), reject(new Error('error'))), { once: true })
  })
}

export async function videoCover(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await waitFor(video, 'loadeddata', 15_000)
    // Half a second in skips the black first frame many phones record.
    video.currentTime = Math.min(0.5, (video.duration || 0) / 2)
    await waitFor(video, 'seeked', 10_000)
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    if (!canvas.width || !canvas.height) return null
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
