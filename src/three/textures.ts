// Procedural floor textures drawn on a canvas, so nothing has to be downloaded.
// Each texture covers TILE_M metres and repeats across the room.
import * as THREE from 'three'
import type { FloorFinish } from '../core/types'

export const TEXTURE_SIZE_M: Record<FloorFinish, number> = {
  marble: 1.2, parquet: 1.2, wood: 2.4, tile: 1.2, carpet: 1, concrete: 2, deck: 1.2, plain: 1,
}

const cache = new Map<string, THREE.CanvasTexture>()

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex)
  c.offsetHSL(0, 0, k)
  return `#${c.getHexString()}`
}

function rng(seed: number) {
  let s = seed % 2147483647 || 1
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

function draw(finish: FloorFinish, base: string, ctx: CanvasRenderingContext2D, N: number) {
  const r = rng(finish.length * 97 + parseInt(base.slice(1), 16))
  ctx.fillStyle = base
  ctx.fillRect(0, 0, N, N)
  switch (finish) {
    case 'marble':
    case 'tile': {
      const n = finish === 'marble' ? 2 : 4 // 60 cm or 30 cm tiles
      const s = N / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = shade(base, (r() - 0.5) * 0.05)
        ctx.fillRect(i * s, j * s, s, s)
        if (finish === 'marble') {
          ctx.strokeStyle = shade(base, -0.12)
          ctx.globalAlpha = 0.35
          ctx.lineWidth = 1.5
          for (let v = 0; v < 3; v++) {
            ctx.beginPath()
            let x = i * s + r() * s, y = j * s
            ctx.moveTo(x, y)
            for (let k = 0; k < 6; k++) { x += (r() - 0.5) * s * 0.4; y += s / 6; ctx.lineTo(x, y) }
            ctx.stroke()
          }
          ctx.globalAlpha = 1
        }
      }
      ctx.strokeStyle = shade(base, finish === 'marble' ? -0.18 : -0.22)
      ctx.lineWidth = finish === 'marble' ? 1.5 : 3
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, N); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(N, i * s); ctx.stroke()
      }
      break
    }
    case 'parquet': {
      // Basketweave: 30 cm squares of four strips, alternating direction.
      const q = N / 4, strip = q / 4
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = shade(base, (r() - 0.5) * 0.12)
          if ((i + j) % 2 === 0) ctx.fillRect(i * q, j * q + k * strip, q, strip)
          else ctx.fillRect(i * q + k * strip, j * q, strip, q)
        }
      ctx.strokeStyle = shade(base, -0.25)
      ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
        for (let k = 0; k <= 4; k++) {
          ctx.beginPath()
          if ((i + j) % 2 === 0) { ctx.moveTo(i * q, j * q + k * strip); ctx.lineTo((i + 1) * q, j * q + k * strip) }
          else { ctx.moveTo(i * q + k * strip, j * q); ctx.lineTo(i * q + k * strip, (j + 1) * q) }
          ctx.stroke()
        }
      break
    }
    case 'wood':
    case 'deck': {
      const rows = finish === 'wood' ? 12 : 8
      const h = N / rows
      for (let i = 0; i < rows; i++) {
        let x = -r() * N
        while (x < N) {
          const len = N * (0.35 + r() * 0.4)
          ctx.fillStyle = shade(base, (r() - 0.5) * 0.1)
          ctx.fillRect(x, i * h, len, h)
          ctx.strokeStyle = shade(base, -0.25)
          ctx.lineWidth = finish === 'deck' ? 3 : 1.2
          ctx.strokeRect(x, i * h, len, h)
          x += len
        }
      }
      break
    }
    case 'carpet':
    case 'concrete': {
      const img = ctx.getImageData(0, 0, N, N)
      const c = new THREE.Color(base)
      for (let p = 0; p < img.data.length; p += 4) {
        const k = 1 + (r() - 0.5) * (finish === 'carpet' ? 0.16 : 0.08)
        img.data[p] = Math.min(255, c.r * 255 * k)
        img.data[p + 1] = Math.min(255, c.g * 255 * k)
        img.data[p + 2] = Math.min(255, c.b * 255 * k)
      }
      ctx.putImageData(img, 0, 0)
      break
    }
    case 'plain':
      break
  }
}

export function floorTexture(finish: FloorFinish, color: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const key = `${finish}|${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const N = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = N
  draw(finish, color, canvas.getContext('2d')!, N)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const s = 1 / TEXTURE_SIZE_M[finish]
  tex.repeat.set(s, s)
  cache.set(key, tex)
  return tex
}
