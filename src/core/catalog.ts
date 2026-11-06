import type { FloorFinish, FurnitureKind } from './types'

export interface KindInfo { label: string; w: number; d: number; h: number; color: string; accent?: string }

/** Typical sizes in metres, used when a photo gives no better estimate. */
export const FURNITURE_KINDS: Record<FurnitureKind, KindInfo> = {
  'sofa': { label: 'Sofa', w: 2.2, d: 0.95, h: 0.85, color: '#a49c91', accent: '#5a3a26' },
  'armchair': { label: 'Armchair', w: 0.85, d: 0.85, h: 0.9, color: '#8e8a84', accent: '#5a3a26' },
  'ottoman': { label: 'Ottoman / pouf', w: 0.8, d: 0.6, h: 0.44, color: '#d0c4ae' },
  'coffee-table': { label: 'Coffee table', w: 1.1, d: 0.6, h: 0.42, color: '#a8743f' },
  'side-table': { label: 'Side table', w: 0.5, d: 0.5, h: 0.55, color: '#a8743f' },
  'tv-console': { label: 'TV console', w: 1.8, d: 0.45, h: 0.55, color: '#9a6d45', accent: '#b48a60' },
  'tv': { label: 'TV', w: 1.45, d: 0.25, h: 0.9, color: '#121214' },
  'sideboard': { label: 'Sideboard', w: 1.6, d: 0.45, h: 0.78, color: '#9a6d45', accent: '#121214' },
  'dining-table': { label: 'Dining table', w: 1.8, d: 0.9, h: 0.75, color: '#c38c4e' },
  'dining-chair': { label: 'Dining chair', w: 0.45, d: 0.5, h: 0.84, color: '#a8743f', accent: '#3f4652' },
  'high-chair': { label: 'High chair', w: 0.46, d: 0.5, h: 0.8, color: '#d3a56c', accent: '#f2f1ec' },
  'bed': { label: 'Bed', w: 1.6, d: 2.1, h: 1.0, color: '#f2f1ec', accent: '#efe9dd' },
  'nightstand': { label: 'Nightstand', w: 0.45, d: 0.4, h: 0.55, color: '#4a2617' },
  'wardrobe': { label: 'Wardrobe', w: 1.2, d: 0.6, h: 2.1, color: '#f2f1ec', accent: '#3a2a20' },
  'dresser': { label: 'Chest of drawers', w: 0.9, d: 0.48, h: 0.8, color: '#f2f1ec', accent: '#9ea2a6' },
  'desk': { label: 'Desk', w: 1.2, d: 0.6, h: 0.74, color: '#f2f1ec' },
  'office-chair': { label: 'Office chair', w: 0.62, d: 0.62, h: 1.05, color: '#34373c', accent: '#f2f1ec' },
  'bookcase': { label: 'Bookcase / shelving', w: 0.8, d: 0.35, h: 1.5, color: '#f2f1ec' },
  'crib': { label: 'Crib / cot', w: 1.27, d: 0.74, h: 0.9, color: '#d3a56c', accent: '#ffffff' },
  'rug': { label: 'Rug / play mat', w: 2.0, d: 1.4, h: 0.012, color: '#ddd7ca', accent: '#2c6c83' },
  'floor-lamp': { label: 'Floor lamp', w: 0.4, d: 0.4, h: 1.6, color: '#9ea2a6', accent: '#e9e3d6' },
  'plant': { label: 'Plant', w: 0.5, d: 0.5, h: 1.2, color: '#4f7a4a', accent: '#c9b79a' },
  'cabinet': { label: 'Cabinet / storage', w: 0.8, d: 0.45, h: 0.9, color: '#f2f1ec', accent: '#9ea2a6' },
  'other': { label: 'Other', w: 0.8, d: 0.6, h: 0.8, color: '#b9b4ab' },
}

export const FURNITURE_KIND_LIST = Object.keys(FURNITURE_KINDS) as FurnitureKind[]

export const FLOOR_FINISHES: Record<FloorFinish, { label: string; color: string }> = {
  marble: { label: 'Marble', color: '#cbbba3' },
  parquet: { label: 'Parquet', color: '#9a5a2b' },
  wood: { label: 'Wood planks', color: '#b0814f' },
  tile: { label: 'Tiles', color: '#c9c8c3' },
  carpet: { label: 'Carpet', color: '#a9a39a' },
  concrete: { label: 'Concrete', color: '#a7a6a1' },
  deck: { label: 'Decking', color: '#7d6650' },
  plain: { label: 'Plain', color: '#d8d3c8' },
}

export const FLOOR_FINISH_LIST = Object.keys(FLOOR_FINISHES) as FloorFinish[]

/** A sensible first guess at a room's floor from its name. */
export function guessFloor(name: string): FloorFinish {
  const n = name.toLowerCase()
  if (/bath|wc|toilet|powder|shower|kitchen|utility|laundry|yard|store/.test(n)) return 'tile'
  if (/bed|master|nursery|kid|guest/.test(n)) return 'parquet'
  if (/balcon|terrace|deck|patio|ac ledge|a\/c/.test(n)) return 'deck'
  if (/study|office/.test(n)) return 'wood'
  return 'plain'
}
