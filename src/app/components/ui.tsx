import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-[#2f6f5e] text-white hover:bg-[#285f51] border-transparent',
    secondary: 'bg-white text-[#1f1d1a] hover:bg-black/5 border-black/12',
    ghost: 'bg-transparent text-[#1f1d1a] hover:bg-black/5 border-transparent',
    danger: 'bg-white text-[#b42f2f] hover:bg-[#b42f2f]/5 border-[#b42f2f]/30',
  }[variant]
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} />
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-black/8 px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#6b665e]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-2.5 block text-sm">
      <span className="mb-1 block text-xs font-medium text-[#4a463f]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-[#8a847a]">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-lg border border-black/12 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#2f6f5e]/15'

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[#4a463f]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#2f6f5e]/25 border-t-[#2f6f5e]" />
      {label}
    </span>
  )
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const c = { info: 'bg-[#2f6f5e]/8 text-[#24453c] border-[#2f6f5e]/20', warn: 'bg-[#c98a1e]/10 text-[#6b4a10] border-[#c98a1e]/25', error: 'bg-[#b42f2f]/8 text-[#7a1f1f] border-[#b42f2f]/25' }[tone]
  return <div className={`rounded-lg border px-3 py-2 text-[13px] leading-snug ${c}`}>{children}</div>
}

/** Reads a file picker or drop and hands back the files. */
export function DropZone({ onFiles, accept = 'image/*', multiple = false, children, testId }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; children: ReactNode; testId?: string }) {
  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-black/15 bg-white/60 px-3 py-5 text-center text-sm text-[#4a463f] transition hover:border-[#2f6f5e]/60 hover:bg-[#2f6f5e]/5"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].filter((x) => x.type.startsWith('image/') || accept !== 'image/*'); if (f.length) onFiles(multiple ? f : [f[0]]) }}
    >
      {children}
      <input type="file" accept={accept} multiple={multiple} className="hidden" data-testid={testId} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) onFiles(f); e.target.value = '' }} />
    </label>
  )
}
