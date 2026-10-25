import assert from 'node:assert/strict'
import test from 'node:test'
import { bindTelegramBack, parentLocation } from './navigation.js'

test('back follows the app hierarchy including direct links', () => {
  assert.equal(parentLocation({ pathname: '/words/42' }), '/words')
  assert.equal(parentLocation({ pathname: '/words/42', state: { from: '/words?language=zh&q=明天' } }), '/words?language=zh&q=明天')
  assert.equal(parentLocation({ pathname: '/words', search: '?language=zh&view=train' }), '/words?language=zh')
  assert.equal(parentLocation({ pathname: '/words', search: '?view=add' }), '/words')
  assert.equal(parentLocation({ pathname: '/habits' }), '/')
  assert.equal(parentLocation({ pathname: '/focus' }), '/')
  assert.equal(parentLocation({ pathname: '/focus', state: { from: '/more' } }), '/more')
  assert.equal(parentLocation({ pathname: '/words/1', state: { from: 'https://example.invalid' } }), '/words')
})

test('native back attaches one handler and cleans it up on screen changes', () => {
  const handlers = new Set()
  let visible = false, clicks = 0
  const app = { isVersionAtLeast: () => true, BackButton: {
    onClick: cb => handlers.add(cb), offClick: cb => handlers.delete(cb),
    show: () => { visible = true }, hide: () => { visible = false },
  } }
  const cleanup = bindTelegramBack(app, () => clicks++, true)
  assert.equal(visible, true); handlers.forEach(cb => cb()); assert.equal(clicks, 1)
  cleanup(); assert.equal(handlers.size, 0); assert.equal(visible, false)
  const home = bindTelegramBack(app, () => clicks++, false)
  assert.equal(visible, false); home(); assert.equal(handlers.size, 0)
  assert.doesNotThrow(() => bindTelegramBack(null, () => {}, true)())
})
