export function parentLocation(location) {
  const { pathname, search = '', state } = location
  if (/^\/words\/[^/]+$/.test(pathname)) {
    const from = state?.from
    return typeof from === 'string' && /^\/words(?:\?|$)/.test(from) ? from : '/words'
  }
  if (pathname === '/words' && new URLSearchParams(search).has('view')) {
    const params = new URLSearchParams(search)
    params.delete('view')
    return '/words' + (params.size ? '?' + params.toString() : '')
  }
  if (['/focus', '/counters'].includes(pathname)) return state?.from === '/more' ? '/more' : '/'
  return '/'
}

export function bindTelegramBack(webApp, callback, visible) {
  if (!webApp?.BackButton || !webApp.isVersionAtLeast?.('6.1')) return () => {}
  const button = webApp.BackButton
  button.onClick(callback)
  if (visible) button.show()
  else button.hide()
  return () => { button.offClick(callback); button.hide() }
}
