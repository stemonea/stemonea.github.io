/**
 * Dimensions of the Macintosh (1 unit = 10 cm, roughly the real 128K proportions).
 * The body is centred on the origin; the desk sits at y = -BODY.h / 2.
 */
export const BODY = { w: 2.46, h: 3.45, d: 2.77, r: 0.11 }

/** Depth of the front bezel shell (the part with the screen hole). */
export const BEZEL_DEPTH = 0.32
export const FRONT_Z = BODY.d / 2 // front face of the bezel

/** Screen glass (4:3, like a CRT). */
export const SCREEN = { w: 1.8, h: 1.35, y: 0.76, recess: 0.15 }
export const SCREEN_Z = FRONT_Z - SCREEN.recess

/** Opening in the bezel around the screen. */
export const OPENING = { w: SCREEN.w + 0.28, h: SCREEN.h + 0.28, r: 0.1 }

/** The floppy/badge slot. */
export const SLOT = { x: 0.4, y: -0.3, w: 0.98, h: 0.075 }

/** 3.5" floppy disk (90 × 94 mm, a bit thicker than real so it reads on screen). About half of it stays out of the slot, label visible. */
export const CARD = { w: 0.9, h: 0.94, t: 0.036, r: 0.02, chamfer: 0.05, inserted: 0.52 }

export const APPLE_LOGO = { x: -0.78, y: -0.36, size: 0.15 }

/** Vertical extent that must be visible when the Mac is on: from the top of the bezel opening down to the badge. */
export const FRAME_ON = { top: SCREEN.y + OPENING.h / 2 + 0.05, bottom: SLOT.y - 0.36, width: BODY.w + 0.22 }

export const FOV = 28

/** iPhone (used instead of the Mac on phones), centred on the origin, screen facing +Z. */
export const PHONE = { w: 1.44, h: 2.94, d: 0.17, r: 0.25 }
export const PHONE_Z = PHONE.d / 2
export const PHONE_SCREEN = { w: 1.33, h: 2.83, r: 0.2 }

/** 24" iMac (2021+): thin colour slab with white bezel and coloured chin, on a bent stand. */
export const IMAC = { w: 2.9, h: 2.12, d: 0.07, r: 0.07, bezel: 0.07, chin: 0.42, lift: 0.55 }
export const IMAC_SCREEN = { w: IMAC.w - 2 * IMAC.bezel, h: ((IMAC.w - 2 * IMAC.bezel) * 9) / 16 }
/** y of the iMac's screen centre (the body sits on the stand, bottom at IMAC.lift). */
export const IMAC_SCREEN_Y = IMAC.lift + IMAC.h - IMAC.bezel - IMAC_SCREEN.h / 2

/** MacBook, open: base on the desk, lid hinged at the back edge. */
export const MBP = { w: 3.04, d: 2.12, base: 0.07, lidT: 0.035, lidH: 1.98, tilt: 0.28, r: 0.09 }
export const MBP_SCREEN = { w: 2.86, h: 2.86 / 1.6, y: MBP.lidH / 2 + 0.035 }

export type Machine = 'macintosh' | 'imac' | 'macbook'

/** iMac colours: [chin / front, back / stand, wallpaper]. */
export const IMAC_COLORS = [
  { name: 'Blue', front: '#a9c9ee', back: '#3d74c4', wall: ['#5aa0ff', '#2b55c9'] },
  { name: 'Green', front: '#b6dcc0', back: '#3f8f5c', wall: ['#6fd38f', '#1f7a4a'] },
  { name: 'Pink', front: '#f3c0cf', back: '#c2486b', wall: ['#ff8fb3', '#c2386b'] },
  { name: 'Silver', front: '#e4e5e8', back: '#a7aab0', wall: ['#c9ced8', '#7d8594'] },
  { name: 'Yellow', front: '#f6dc8f', back: '#d39b1d', wall: ['#ffd25a', '#e08a12'] },
  { name: 'Orange', front: '#f6c3a1', back: '#d56a2c', wall: ['#ff9a5a', '#d4471f'] },
  { name: 'Purple', front: '#cfc3ef', back: '#6f56b5', wall: ['#a58bff', '#5a37c2'] },
] as const
