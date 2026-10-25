import assert from 'node:assert/strict'
import test from 'node:test'
import { affectedResources, createDataStore } from './data-store.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('concurrent readers share a request and fresh results', async () => {
  const task = deferred()
  let calls = 0
  const store = createDataStore(() => { calls++; return task.promise })
  const first = store.read('/habits'), second = store.read('/habits')
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  task.resolve([{ id: 1 }]); await first
  await store.read('/habits')
  assert.equal(calls, 1)
  assert.deepEqual(store.snapshot('/habits').data, [{ id: 1 }])
})

test('an old response cannot overwrite a mutation followed by a new request', async () => {
  const old = deferred(), current = deferred()
  let calls = 0
  const store = createDataStore(() => ++calls === 1 ? old.promise : current.promise)
  store.subscribe('/habits', () => {})
  const first = store.read('/habits'); await Promise.resolve()
  store.invalidate(['/habits'])
  const second = store.read('/habits'); await Promise.resolve()
  current.resolve(['new']); await second
  old.resolve(['old']); await first
  assert.deepEqual(store.snapshot('/habits').data, ['new'])
})

test('review invalidation keeps the active training deck and dictionary lookups stable', async () => {
  let calls = 0
  const store = createDataStore(async key => { calls++; return [key, calls] })
  store.subscribe('/words/due', () => {}, false)
  store.subscribe('/words/lookup?text=apple', () => {})
  await store.read('/words/due'); await store.read('/words/lookup?text=apple')
  const deck = store.snapshot('/words/due').data
  store.invalidate(affectedResources('/words/12/review'))
  assert.equal(calls, 2)
  assert.equal(store.snapshot('/words/due').data, deck)
  assert.equal(store.snapshot('/words/lookup?text=apple').stale, false)
  await store.read('/words/due')
  assert.equal(calls, 3)
})

test('expired data refreshes and a failed refresh keeps the last good value', async () => {
  let now = 1, fail = false, calls = 0
  const store = createDataStore(async () => { calls++; if (fail) throw Error('offline'); return ['saved'] }, { ttl: 30, now: () => now })
  await store.read('/summary'); now += 31; fail = true
  await store.read('/summary')
  assert.equal(calls, 2)
  assert.deepEqual(store.snapshot('/summary').data, ['saved'])
  assert.equal(store.snapshot('/summary').loading, false)
  assert.match(store.snapshot('/summary').error.message, /offline/)
})
