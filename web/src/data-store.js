const EMPTY = Object.freeze({ data: null, error: null, loading: false, stale: true })

export function affectedResources(path) {
  const section = path.split('?')[0].split('/')[1]
  if (section === 'words' || section === 'lists') return ['/words', '/lists', '/summary']
  return [`/${section}`, '/summary']
}

export function createDataStore(fetcher, { ttl = 30_000, now = Date.now } = {}) {
  const entries = new Map()
  function entry(key) {
    if (!entries.has(key)) {
      if (entries.size >= 200) {
        for (const [path, value] of entries) {
          if (!value.listeners.size && !value.promise) { entries.delete(path); break }
        }
      }
      entries.set(key, { snapshot: EMPTY, at: 0, version: 0, promise: null, listeners: new Map() })
    }
    return entries.get(key)
  }
  function publish(record, changes) {
    record.snapshot = { ...record.snapshot, ...changes }
    record.listeners.forEach((_, listener) => listener())
  }
  function read(key, force = false) {
    if (!key) return Promise.resolve(null)
    const record = entry(key)
    if (record.promise) return record.promise
    if (!force && !record.snapshot.stale && now() - record.at < ttl) return Promise.resolve(record.snapshot.data)
    const version = record.version
    publish(record, { loading: true, error: null })
    const promise = Promise.resolve().then(() => fetcher(key)).then(data => {
      if (version === record.version) {
        record.at = now()
        publish(record, { data, loading: false, stale: false, error: null })
      }
      return data
    }).catch(error => {
      if (version === record.version) publish(record, { error, loading: false })
      return null
    }).finally(() => {
      if (record.promise === promise) record.promise = null
    })
    record.promise = promise
    return promise
  }
  function invalidate(prefixes) {
    for (const [key, record] of entries) {
      if (key.startsWith('/words/lookup?') && !prefixes.includes('/words/lookup')) continue
      if (!prefixes.some(prefix => key === prefix || key.startsWith(prefix + '/') || key.startsWith(prefix + '?'))) continue
      record.version += 1
      record.promise = null
      publish(record, { stale: true })
      if ([...record.listeners.values()].some(Boolean)) read(key, true)
    }
  }
  return {
    snapshot: key => key ? entry(key).snapshot : EMPTY,
    subscribe(key, listener, live = true) {
      if (!key) return () => {}
      const record = entry(key)
      record.listeners.set(listener, live)
      return () => record.listeners.delete(listener)
    },
    read,
    update(key, updater) {
      const record = entry(key)
      if (record.snapshot.data != null) publish(record, { data: updater(record.snapshot.data) })
    },
    invalidate,
    retry() { entries.forEach((record, key) => { if (record.listeners.size) read(key, true) }) },
  }
}
