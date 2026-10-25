import assert from 'node:assert/strict'
import test from 'node:test'
import { focusElapsed } from './timers.js'

test('focus stops at its target even after a long background pause', () => {
  assert.equal(focusElapsed({ acc: 0, since: 1000, target: 1500 }, 3601000), 1500)
  assert.equal(focusElapsed({ acc: 75, since: null, target: 1500 }, 3601000), 75)
  assert.equal(focusElapsed({ acc: 10, since: 1000, target: 0 }, 21000), 30)
})
