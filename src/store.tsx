import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { clearSession, type Session } from './lib/auth.ts'
import { normalize } from './lib/defaults.ts'
import { loadState, pullIfNewer, pushRemote, writeCache, writeMeta, type Meta } from './lib/storage.ts'
import type { AppData } from './types.ts'

export type Sync = 'loading' | 'saved' | 'saving' | 'offline' | 'error' | 'conflict'

type StoreValue = {
  data: AppData
  sync: Sync
  syncError: string | null
  fatal: string | null
  hadLocal: boolean
  mutate: (fn: (draft: AppData) => void) => void
  replace: (next: AppData, force?: boolean) => void
  resolveConflict: (choice: 'local' | 'remote') => void
  keepLocal: () => void
  startOver: () => void
  logout: () => void
}

const Ctx = createContext<StoreValue | null>(null)

const blank: AppData = {
  version: 1,
  updatedAt: '',
  categories: [],
  accounts: [],
  transactions: [],
  budgets: [],
  recurring: [],
  goals: [],
  loans: [],
  portfolio: [],
}

export function StoreProvider({ session, onLogout, children }: { session: Session; onLogout: () => void; children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null)
  const [sync, setSync] = useState<Sync>('loading')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [hadLocal, setHadLocal] = useState(false)
  const dataRef = useRef<AppData | null>(null)
  const metaRef = useRef<Meta>({ remoteUpdatedAt: null, syncedDataUpdatedAt: null })
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const queuedRef = useRef(false)
  const forceQueuedRef = useRef(false)
  const timerRef = useRef(0)
  const fatalRef = useRef<string | null>(null)
  const remoteRef = useRef<{ data: AppData | null; updatedAt: string | null }>({ data: null, updatedAt: null })
  const persistRef = useRef<(force?: boolean) => Promise<void>>(async () => {})

  persistRef.current = async (force = false) => {
    const current = dataRef.current
    if (!current || (fatalRef.current && !force)) return
    try {
      await writeCache(session.key, current)
    } catch {
      // The encrypted cache is best-effort.
    }
    if (savingRef.current) {
      queuedRef.current = true
      forceQueuedRef.current = forceQueuedRef.current || force
      return
    }
    savingRef.current = true
    setSync('saving')
    try {
      const result = await pushRemote(session, current, metaRef.current.remoteUpdatedAt, force)
      if (result.ok) {
        metaRef.current = { remoteUpdatedAt: result.remoteUpdatedAt, syncedDataUpdatedAt: current.updatedAt }
        writeMeta(metaRef.current)
        dirtyRef.current = false
        setSyncError(null)
        setSync('saved')
      } else if (result.conflict) {
        queuedRef.current = false
        forceQueuedRef.current = false
        remoteRef.current = { data: result.remoteData, updatedAt: result.remoteUpdatedAt }
        setSync('conflict')
      } else {
        setSyncError(result.error)
        setSync(result.offline ? 'offline' : 'error')
      }
    } finally {
      savingRef.current = false
      if (queuedRef.current) {
        const nextForce = forceQueuedRef.current
        queuedRef.current = false
        forceQueuedRef.current = false
        void persistRef.current(nextForce)
      }
    }
  }

  useEffect(() => {
    let cancel = false
    loadState(session).then((loaded) => {
      if (cancel) return
      metaRef.current = loaded.meta
      dataRef.current = loaded.data
      setData(loaded.data)
      setHadLocal(loaded.hadLocal)
      if (loaded.fatal) {
        fatalRef.current = loaded.fatal
        setFatal(loaded.fatal)
        setSync('error')
        return
      }
      if (loaded.conflict) {
        remoteRef.current = { data: loaded.remoteData, updatedAt: loaded.remoteUpdatedAt }
        setSync('conflict')
        return
      }
      if (loaded.dirty) {
        dirtyRef.current = true
        void persistRef.current(loaded.force)
      } else setSync(loaded.offline ? 'offline' : 'saved')
    })
    return () => {
      cancel = true
    }
  }, [session])

  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return
      window.clearTimeout(timerRef.current)
      void persistRef.current()
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
      if (document.visibilityState === 'visible') void refresh()
    }
    async function refresh() {
      const local = dataRef.current
      if (!local || dirtyRef.current || savingRef.current || fatalRef.current) return
      const result = await pullIfNewer(session, metaRef.current, local)
      if (dirtyRef.current || !dataRef.current) return
      if (result.action === 'take') {
        metaRef.current = result.meta
        dataRef.current = result.data
        setData(result.data)
        setSync('saved')
      } else if (result.action === 'conflict') {
        remoteRef.current = { data: result.data, updatedAt: result.remoteUpdatedAt }
        setSync('conflict')
      }
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
      window.clearTimeout(timerRef.current)
    }
  }, [session])

  const api = useMemo<StoreValue>(() => {
    const publish = (next: AppData, force = false) => {
      next.updatedAt = new Date().toISOString()
      dataRef.current = next
      setData(next)
      dirtyRef.current = true
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void persistRef.current(force), force ? 0 : 1200)
      void writeCache(session.key, next).catch(() => {})
    }
    return {
      data: data ?? blank,
      sync,
      syncError,
      fatal,
      hadLocal,
      mutate(fn) {
        setData((prev) => {
          if (!prev) return prev
          const next = structuredClone(prev)
          fn(next)
          next.updatedAt = new Date().toISOString()
          dataRef.current = next
          dirtyRef.current = true
          window.clearTimeout(timerRef.current)
          timerRef.current = window.setTimeout(() => void persistRef.current(), 1200)
          void writeCache(session.key, next).catch(() => {})
          return next
        })
      },
      replace(next, force = false) {
        fatalRef.current = null
        setFatal(null)
        publish(normalize(next), force)
      },
      resolveConflict(choice) {
        if (choice === 'remote' && remoteRef.current.data) {
          const next = remoteRef.current.data
          dataRef.current = next
          setData(next)
          dirtyRef.current = false
          metaRef.current = { remoteUpdatedAt: remoteRef.current.updatedAt, syncedDataUpdatedAt: next.updatedAt }
          writeMeta(metaRef.current)
          void writeCache(session.key, next)
          setSync('saved')
          return
        }
        void persistRef.current(true)
      },
      keepLocal() {
        fatalRef.current = null
        setFatal(null)
        dirtyRef.current = true
        void persistRef.current(true)
      },
      startOver() {
        fatalRef.current = null
        setFatal(null)
        publish(normalize(null), true)
      },
      logout() {
        void clearSession().finally(onLogout)
      },
    }
  }, [data, fatal, hadLocal, onLogout, session, sync, syncError])

  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="font-serif text-3xl">Despesas</p>
      </div>
    )
  }

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useStore() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('store')
  return ctx
}
