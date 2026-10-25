import { useRef, useState } from 'react'
import { api, buzz, isoDay, resources } from './api.js'

export function useHabitToggle() {
  const locks = useRef(new Set())
  const [pending, setPending] = useState(new Set())
  const toggle = async (habit, day = isoDay()) => {
    if (locks.current.has(habit.id)) return
    locks.current.add(habit.id)
    setPending(new Set(locks.current))
    const wasDone = habit.log.includes(day)
    const set = done => resources.update('/habits', rows => rows.map(row => row.id !== habit.id ? row : {
      ...row, log: done ? [...new Set([...row.log, day])] : row.log.filter(value => value !== day),
      today: day === isoDay() ? done : row.today,
    }))
    set(!wasDone)
    buzz('soft')
    try {
      await api(`/habits/${habit.id}/toggle`, { date: day })
      await resources.read('/habits', true)
    } catch { set(wasDone) } finally {
      locks.current.delete(habit.id)
      setPending(new Set(locks.current))
    }
  }
  return { toggle, pending }
}
