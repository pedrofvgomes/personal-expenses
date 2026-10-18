const INVITED = /^data-u[a-f0-9]{8}\.enc$/

export function isInvitedFile(file: string): boolean {
  return INVITED.test(file)
}

export function invitedId(file: string): string | null {
  const match = /^data-u([a-f0-9]{8})\.enc$/.exec(file)
  return match?.[1] ?? null
}

export function invitedFile(id: string): string {
  return `data-u${id}.enc`
}

// data-u… is a new book. data.enc and data-2.enc stay the two that already exist.
export function bookFile(session: { file?: string }): string {
  if (!session.file) return 'data.enc'
  if (session.file === 'data-2.enc' || isInvitedFile(session.file)) return session.file
  throw new Error('book')
}
