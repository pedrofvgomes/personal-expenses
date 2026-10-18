import { describe, expect, it } from 'vitest'
import { bookFile, bookMoved } from './storage.ts'

describe('second book', () => {
  it('keeps a session without a file on the original book', () => {
    expect(bookFile({})).toBe('data.enc')
    expect(bookFile({ file: 'data-2.enc' })).toBe('data-2.enc')
  })

  it('ignores a gist clock change that did not touch this book', () => {
    expect(bookMoved('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(false)
    expect(bookMoved('2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(true)
    expect(bookMoved(null, '2026-01-01T00:00:00.000Z')).toBe(false)
    expect(bookMoved('2026-02-01T00:00:00.000Z', null)).toBe(false)
  })
})
