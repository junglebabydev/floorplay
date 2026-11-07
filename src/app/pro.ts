// Floorimate Pro: exports without the watermark, and the extras (renders, walkthrough video,
// PDF and CAD) once checkout is live. Until then everything works for everyone, watermarked.
// The payment provider is not chosen yet: plug its licence check in with setLicenseVerifier.

export const PRO = {
  /** Flip to true once a payment provider and checkout link are set up. */
  checkoutLive: false,
  checkoutUrl: '',
  price: '$9.99 a month',
}

export type ProFeature = 'render' | 'video' | 'pdf' | 'dxf'

export const PRO_FEATURES: { id: ProFeature | 'nomark'; title: string; body: string }[] = [
  { id: 'nomark', title: 'No watermark', body: 'Clean images, PDFs, videos and renders.' },
  { id: 'render', title: 'Lifelike renders', body: 'Turn any 3D view into a photo-like image, with your real furniture.' },
  { id: 'video', title: 'Walkthrough video', body: 'A fly-around and room-by-room tour to share with family or movers.' },
  { id: 'pdf', title: 'PDF plan for movers', body: 'The plan with every piece numbered, and a list of what goes where.' },
  { id: 'dxf', title: 'CAD export', body: 'A DXF in millimetres for AutoCAD, SketchUp or your contractor.' },
]

export interface License {
  key: string
  plan: 'pro'
  /** ISO date the licence is paid up to, if the provider says. */
  validUntil?: string
  checkedAt: string
}

const STORAGE_KEY = 'floorimate.pro.v1'

export function loadLicense(): License | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return null
    const l = JSON.parse(raw) as License
    if (!l?.key || l.plan !== 'pro') return null
    if (l.validUntil && Date.parse(l.validUntil) < Date.now()) return null
    return l
  } catch {
    return null
  }
}

export function saveLicense(l: License | null) {
  try {
    if (l) localStorage.setItem(STORAGE_KEY, JSON.stringify(l))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage blocked */ }
}

export const isPro = (l: License | null) => Boolean(l)
/** Before checkout is live, every feature is open (with the watermark). */
export const canUse = (_f: ProFeature, l: License | null) => isPro(l) || !PRO.checkoutLive
export const watermarked = (l: License | null) => !isPro(l)

type Verifier = (key: string) => Promise<License>
let verifier: Verifier = async () => {
  throw new Error("Pro checkout isn't live yet, so there are no licence keys to check. Everything works for free with a small watermark for now.")
}
/** The payment provider integration replaces this with a real licence check. */
export function setLicenseVerifier(v: Verifier) { verifier = v }
export function verifyLicense(key: string): Promise<License> {
  const k = key.trim()
  if (!k) return Promise.reject(new Error('Paste your licence key first.'))
  return verifier(k)
}
