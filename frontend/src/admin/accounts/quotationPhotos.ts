import { compressImage } from '../crm/references/compress'
import { accounts } from './api'

export const MAX_QUOTATION_IMAGES = 2

/** A photo in the editor: already saved (id) or picked but not uploaded yet (file). */
export interface PhotoDraft {
  key: string
  url: string
  id?: number
  file?: File
}

export const photosOf = (images: { id: number; image: string }[] = []): PhotoDraft[] =>
  images.map((i) => ({ key: `saved-${i.id}`, url: i.image, id: i.id }))

/**
 * Applies the editor's photo changes after the quotation itself is saved: removes deleted ones,
 * then compresses and uploads new ones, so Cancel never changes anything.
 */
export async function syncQuotationImages(quotationId: number, before: PhotoDraft[], after: PhotoDraft[]) {
  const kept = new Set(after.filter((p) => p.id).map((p) => p.id))
  for (const p of before) {
    if (p.id && !kept.has(p.id)) await accounts.deleteQuotationImage(quotationId, p.id)
  }
  for (const p of after) {
    if (p.file) await accounts.uploadQuotationImage(quotationId, await compressImage(p.file), 'photo.jpg')
  }
}
