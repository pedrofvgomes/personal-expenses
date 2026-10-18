import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import { clearSession, resume, type Session } from './lib/auth.ts'
import Accounts from './pages/Accounts.tsx'
import Budgets from './pages/Budgets.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Goals from './pages/Goals.tsx'
import LoanDetail from './pages/LoanDetail.tsx'
import Loans from './pages/Loans.tsx'
import Login from './pages/Login.tsx'
import Recurring from './pages/Recurring.tsx'
import Settings from './pages/Settings.tsx'
import Transactions from './pages/Transactions.tsx'
import Wealth from './pages/Wealth.tsx'
import { faviconSvg, paletteAccent } from './lib/palette.ts'
import { StoreProvider, useStore } from './store.tsx'
import { ThemeProvider } from './theme.tsx'

export default function App() {
  return (
    <ThemeProvider>
      <Gate />
    </ThemeProvider>
  )
}

function UserPalette() {
  const { data } = useStore()
  useEffect(() => {
    const root = document.documentElement
    const accent = paletteAccent(data.palette)
    if (data.palette === 'mar') delete root.dataset.palette
    else root.dataset.palette = data.palette
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const previousIcon = icon?.href
    const previousTheme = theme?.content
    if (icon) icon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(accent))}`
    if (theme) theme.content = accent
    return () => {
      delete root.dataset.palette
      if (icon && previousIcon) icon.href = previousIcon
      if (theme && previousTheme) theme.content = previousTheme
    }
  }, [data.palette])
  return null
}

function Gate() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const logout = useCallback(() => setSession(null), [])

  useEffect(() => {
    resume().then((next) => {
      setSession(next)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="font-serif text-3xl">Despesas</p>
      </div>
    )
  }
  if (!session) return <Login onUnlock={setSession} />

  return (
    <StoreProvider session={session} onLogout={() => { void clearSession().finally(logout) }}>
      <UserPalette />
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="movimentos" element={<Transactions />} />
            <Route path="orcamentos" element={<Budgets />} />
            <Route path="recorrentes" element={<Recurring />} />
            <Route path="contas" element={<Accounts />} />
            <Route path="patrimonio" element={<Wealth />} />
            <Route path="poupanca" element={<Goals />} />
            <Route path="credito" element={<Loans />} />
            <Route path="credito/:id" element={<LoanDetail />} />
            <Route path="definicoes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  )
}
