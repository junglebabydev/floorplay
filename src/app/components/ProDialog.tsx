import { useState } from 'react'
import { BadgeCheck, Crown, X } from 'lucide-react'
import { PRO, PRO_FEATURES, verifyLicense } from '../pro'
import { useStore } from '../store'
import { Button, Callout, inputCls, Spinner } from './ui'

export function ProDialog() {
  const { proOpen, openPro, license, setLicense, notify } = useStore()
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!proOpen) return null
  const close = () => openPro(null)
  const activate = async () => {
    setChecking(true); setError(null)
    try { setLicense(await verifyLicense(key)); notify('Pro is on. Exports no longer carry the watermark.') }
    catch (e) { setError((e as Error).message) }
    finally { setChecking(false) }
  }
  const asked = proOpen.feature ? PRO_FEATURES.find((f) => f.id === proOpen.feature) : undefined
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#fbfaf8] shadow-2xl" data-testid="pro-dialog">
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Crown size={17} className="text-[#b8862b]" /> Floorimate Pro</h2>
          <button onClick={close} className="rounded p-1 hover:bg-black/5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm">
          {license ? (
            <Callout>You have Pro on this browser. Thank you for supporting Floorimate.</Callout>
          ) : asked ? (
            <p className="mb-3 text-[#4a463f]"><b>{asked.title}</b> is part of Pro.</p>
          ) : null}
          <ul className="mb-4 space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f.id} className="flex gap-2.5">
                <BadgeCheck size={17} className="mt-0.5 flex-none text-[#2f6f5e]" />
                <span><b className="font-semibold">{f.title}.</b> <span className="text-[#5d5850]">{f.body}</span></span>
              </li>
            ))}
          </ul>
          {!license && (
            <>
              {PRO.checkoutLive ? (
                <a href={PRO.checkoutUrl} target="_blank" rel="noreferrer" className="mb-4 flex items-center justify-center rounded-xl bg-[#2f6f5e] px-4 py-2.5 font-semibold text-white">Get Pro for {PRO.price}</a>
              ) : (
                <Callout>Pro is coming soon. Until then every feature is free to use, with a small "Made with Floorimate" mark on exports.</Callout>
              )}
              {PRO.checkoutLive && <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-[#5d5850]">Have a licence key?</label>
                <div className="flex gap-2">
                  <input className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your licence key" data-testid="license-key" />
                  <Button onClick={activate} disabled={checking}>{checking ? <Spinner /> : 'Activate'}</Button>
                </div>
                {error && <p className="mt-2 text-[13px] text-[#b42f2f]" data-testid="license-error">{error}</p>}
              </div>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/8 px-5 py-3">
          {license && <Button variant="danger" onClick={() => { setLicense(null); notify('Pro removed from this browser.') }}>Remove licence</Button>}
          <Button onClick={close}>Close</Button>
        </div>
      </div>
    </div>
  )
}
