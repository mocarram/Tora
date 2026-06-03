import { describe, expect, it } from 'vitest'
import { fileExtension, isPreviewableImage } from './fileType'

describe('fileExtension', () => {
  it('extracts the lowercased extension', () => {
    expect(fileExtension('/a/b/Photo.PNG')).toBe('png')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
    expect(fileExtension('name')).toBe('')
    expect(fileExtension('.dotfile')).toBe('')
    expect(fileExtension('trailing.')).toBe('')
  })
})

describe('isPreviewableImage', () => {
  it('recognises common raster image types', () => {
    expect(isPreviewableImage('shot.png')).toBe(true)
    expect(isPreviewableImage('/Users/me/pic.JPEG')).toBe(true)
    expect(isPreviewableImage('anim.gif')).toBe(true)
    expect(isPreviewableImage('photo.heic')).toBe(true)
  })
  it('rejects non-image and unpreviewable files', () => {
    expect(isPreviewableImage('archive.zip')).toBe(false)
    expect(isPreviewableImage('doc.pdf')).toBe(false)
    expect(isPreviewableImage('vector.svg')).toBe(false) // not a raster nativeImage
    expect(isPreviewableImage('noext')).toBe(false)
  })
})
