import { affectedResources, createDataStore } from './data-store.js'

export const tg = window.Telegram?.WebApp

export const resources = createDataStore(path => request(path))

async function request(path, body, method = 'GET') {
  let response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), path.startsWith('/words/lookup') ? 140_000 : 20_000)
  try {
    response = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Init-Data': tg?.initData || '' },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error('http ' + response.status)
      error.status = response.status
      error.detail = await response.json().then(value => value.detail).catch(() => null)
      throw error
    }
    return response.status === 204 ? null : await response.json()
  } catch (error) {
    const message = error.status === 401 ? 'Сессия истекла. Открой приложение заново через Telegram.'
      : error.status === 403 ? 'Приложение доступно только владельцу бота.'
      : typeof error.detail === 'string' && /[а-яё]/i.test(error.detail) ? error.detail
      : error.name === 'AbortError' ? 'Ответ занимает слишком много времени. Попробуй ещё раз.'
      : 'Не удалось загрузить или сохранить данные. Проверь соединение.'
    if (error.status !== 409) window.dispatchEvent(new CustomEvent('app:error', { detail: message }))
    throw error
  } finally { clearTimeout(timeout) }
}

export async function api(path, body, method = body == null ? 'GET' : 'POST') {
  const result = await request(path, body, method)
  if (method !== 'GET') resources.invalidate(affectedResources(path))
  return result
}

export const buzz = (s = 'light') => tg?.HapticFeedback?.impactOccurred(s)
export const say = (text, lang) => {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}
export const hms = s => s >= 3600
  ? `${Math.floor(s / 3600)}ч ${Math.floor(s % 3600 / 60)}м`
  : s >= 60 ? `${Math.floor(s / 60)}м` : `${s}с`
export const clock = s =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}
export const dayWord = n => plural(n, 'день', 'дня', 'дней')

export const days = n => (n <= 1 ? 'завтра' : `через ${n} ${dayWord(n)}`)

export const isoDay = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
