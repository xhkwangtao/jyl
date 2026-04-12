import JSZip from 'jszip'
import type { EditorDocument, PoiRecord } from '../types'

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim() || 'map-data'
}

function createExportDocument(document: EditorDocument): EditorDocument {
  const cleanPois: PoiRecord[] = document.pois.map((poi) => ({
    ...poi,
    photos: poi.photos.map((photo) => ({
      id: photo.id,
      name: photo.name,
      originalPath: photo.originalPath,
      mimeType: photo.mimeType,
      size: photo.size
    }))
  }))

  return {
    ...document,
    poiSummary: {
      visibleCount: cleanPois.filter((poi) => poi.visible).length,
      cardCount: cleanPois.filter((poi) => poi.cardVisible).length,
      hiddenTriggerCount: cleanPois.filter((poi) => !poi.visible).length,
      totalCount: cleanPois.length
    },
    pois: cleanPois
  }
}

export function buildExportJson(document: EditorDocument): string {
  return JSON.stringify(createExportDocument(document), null, 2)
}

export function buildExportWrapper(document: EditorDocument): string {
  return `module.exports = ${buildExportJson(document)}\n`
}

export function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = globalThis.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function downloadExportZip(document: EditorDocument): Promise<void> {
  const zip = new JSZip()
  const baseName = sanitizeFileName(document.sourceFile.replace(/\.\w+$/, ''))
  zip.file(`${baseName}.editor-export.json`, buildExportJson(document))

  const imageFolder = zip.folder('images')
  if (imageFolder) {
    document.pois.forEach((poi) => {
      poi.photos.forEach((photo) => {
        if (photo.bytes) {
          imageFolder.file(photo.name, photo.bytes)
        }
      })
    })
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const anchor = globalThis.document.createElement('a')
  anchor.href = url
  anchor.download = `${baseName}.editor-package.zip`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function defaultJsonFileName(document: EditorDocument): string {
  const baseName = sanitizeFileName(document.sourceFile.replace(/\.\w+$/, ''))
  return `${baseName}.editor-export.json`
}

export function defaultJsFileName(document: EditorDocument): string {
  const baseName = sanitizeFileName(document.sourceFile.replace(/\.\w+$/, ''))
  return `${baseName}.editor-export.js`
}
