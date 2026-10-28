import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { reencodeImage, sniffImage } from './images'

const make = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } } })

describe('sniffImage', () => {
  it('trusts content, not the name', async () => {
    expect(sniffImage(await make(4, 4).jpeg().toBuffer())).toBe('image/jpeg')
    expect(sniffImage(await make(4, 4).png().toBuffer())).toBe('image/png')
    expect(sniffImage(await make(4, 4).webp().toBuffer())).toBe('image/webp')
    expect(sniffImage(Buffer.from('%PDF-1.7 not a photo'))).toBeNull()
    expect(sniffImage(Buffer.from('<svg onload="alert(1)"/>'))).toBeNull()
  })
})

describe('reencodeImage', () => {
  it('drops EXIF so the location of the flat never reaches storage', async () => {
    const withExif = await make(64, 48).jpeg().withExif({ IFD0: { Copyright: 'secret-location', Make: 'TestPhone' } }).toBuffer()
    expect((await sharp(withExif).metadata()).exif).toBeDefined()

    const out = await reencodeImage(withExif)
    const meta = await sharp(out.body).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.format).toBe('jpeg')
    expect(out.body.includes(Buffer.from('secret-location'))).toBe(false)
  })

  it('applies the camera rotation to pixels instead of keeping the tag', async () => {
    const sideways = await make(60, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const out = await reencodeImage(sideways)
    expect([out.width, out.height]).toEqual([20, 60])
    expect((await sharp(out.body).metadata()).orientation).toBeUndefined()
  })

  it('shrinks huge photos and refuses broken data', async () => {
    const big = await reencodeImage(await make(4000, 3000).jpeg().toBuffer())
    expect(Math.max(big.width, big.height)).toBe(2560)
    await expect(reencodeImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))).rejects.toThrow()
  })
})
