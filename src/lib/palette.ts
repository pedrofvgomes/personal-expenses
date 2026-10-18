import type { PaletteId } from '../types.ts'

export const PALETTES: { id: PaletteId; name: string; swatches: [string, string, string]; accent: string }[] = [
  { id: 'mar', name: 'Mar', swatches: ['#f3efe7', '#0f6e6b', '#221c17'], accent: '#0f6e6b' },
  { id: 'vinho', name: 'Vinho', swatches: ['#f6efe9', '#8b2942', '#24161a'], accent: '#8b2942' },
  { id: 'marinho', name: 'Marinho', swatches: ['#eef2f5', '#1e3a5f', '#15202b'], accent: '#1e3a5f' },
  { id: 'ameixa', name: 'Ameixa', swatches: ['#f3eef4', '#6b3a6e', '#221824'], accent: '#6b3a6e' },
]

export function paletteAccent(id: PaletteId): string {
  return PALETTES.find((palette) => palette.id === id)?.accent ?? PALETTES[0].accent
}

export function faviconSvg(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${accent}"/><circle cx="16" cy="16" r="11" fill="#f4efe6"/><path d="M16 8.5 23 15h-2.2v7.2h-9.6V15H9.2Z" fill="${accent}"/><rect x="14.2" y="17.2" width="3.6" height="5" fill="#f4efe6"/></svg>`
}
