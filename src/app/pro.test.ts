import { describe, expect, it } from 'vitest'
import { canUse, PRO, setLicenseVerifier, verifyLicense, watermarked, type License } from './pro'

const lic: License = { key: 'K', plan: 'pro', checkedAt: '2026-11-07' }

describe('Pro', () => {
  it('watermarks free exports only', () => {
    expect(watermarked(null)).toBe(true)
    expect(watermarked(lic)).toBe(false)
  })

  it('opens every feature until checkout is live, then only for Pro', () => {
    const live = PRO.checkoutLive
    try {
      PRO.checkoutLive = false
      expect(canUse('render', null)).toBe(true)
      PRO.checkoutLive = true
      expect(canUse('render', null)).toBe(false)
      expect(canUse('dxf', lic)).toBe(true)
    } finally { PRO.checkoutLive = live }
  })

  it('rejects keys until a payment provider is plugged in', async () => {
    await expect(verifyLicense('abc')).rejects.toThrow(/isn't live yet/)
    await expect(verifyLicense('  ')).rejects.toThrow(/Paste/)
    setLicenseVerifier(async (k) => ({ ...lic, key: k }))
    await expect(verifyLicense(' abc ')).resolves.toMatchObject({ key: 'abc' })
  })
})
