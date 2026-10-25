export const newSessionId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

export function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('app:storage', { detail: { key } }))
    return true
  } catch {
    window.dispatchEvent(new CustomEvent('app:error', { detail: 'Браузер не сохранил таймер. Не закрывай приложение до завершения сессии.' }))
    return false
  }
}
