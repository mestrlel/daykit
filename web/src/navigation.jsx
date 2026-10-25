import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tg } from './api.js'
import { bindTelegramBack, parentLocation } from './navigation.js'

const Navigation = createContext(null)

export function NavigationProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const handlers = useRef([])
  const [count, setCount] = useState(0)
  const register = useCallback(callback => {
    const item = { callback }
    handlers.current.push(item)
    setCount(handlers.current.length)
    return () => {
      handlers.current = handlers.current.filter(handler => handler !== item)
      setCount(handlers.current.length)
    }
  }, [])
  const back = useCallback(() => {
    const local = handlers.current.at(-1)
    if (local) local.callback()
    else if (location.pathname !== '/') navigate(parentLocation(location), { replace: true, state: { restoreScroll: location.state?.scrollY } })
  }, [location, navigate])
  const visible = location.pathname !== '/' || count > 0
  const native = !!(tg?.initData && tg?.isVersionAtLeast?.('6.1'))
  useEffect(() => bindTelegramBack(native ? tg : null, back, visible), [back, visible, native])
  const value = useMemo(() => ({ register, back, visible, native }), [register, back, visible, native])
  return <Navigation.Provider value={value}>{children}</Navigation.Provider>
}

export const useNavigation = () => useContext(Navigation)

export function useBackAction(callback, active = true) {
  const { register } = useNavigation()
  const latest = useRef(callback)
  latest.current = callback
  useEffect(() => active ? register(() => latest.current()) : undefined, [active, register])
}
