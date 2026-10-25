import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarWeek, localDay, weekReport } from './habit-logic.js'

test('calendar weeks stay on local dates and cross month boundaries', () => {
  assert.deepEqual(calendarWeek('2026-11-01'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  assert.equal(calendarWeek('2026-10-25', -1)[0], '2026-10-12')
  assert.equal(localDay(new Date(2026, 9, 25, 0, 1)), '2026-10-25')
})

test('weekly percentages exclude future dates and days before a habit was created', () => {
  const days = calendarWeek('2026-10-21')
  const habits = [
    { created_at: '2026-10-19 09:00:00', log: ['2026-10-19', '2026-10-21', '2026-10-24'] },
    { created_at: '2026-10-20 09:00:00', log: ['2026-10-21'] },
  ]
  assert.deepEqual(weekReport(habits, days, '2026-10-21'), { done: 3, possible: 5, percent: 60, counts: [1, 0, 2, 0, 0, 0, 0] })
  assert.equal(weekReport([], days, '2026-10-21').percent, 0)
})
