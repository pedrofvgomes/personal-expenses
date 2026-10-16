import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

type Theme = { dark: boolean; toggle: () => void }

const Ctx = createContext<Theme | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('desp.theme', next ? 'dark' : 'light')
    setDark(next)
  }

  return <Ctx.Provider value={{ dark, toggle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('theme')
  return ctx
}
