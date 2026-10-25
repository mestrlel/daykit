export function localDay(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function calendarWeek(today, offset = 0) {
  const start = new Date(today + 'T12:00:00')
  start.setDate(start.getDate() - (start.getDay() + 6) % 7 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start)
    day.setDate(day.getDate() + i)
    return localDay(day)
  })
}

export function createdDay(habit) {
  if (!habit.created_at) return '0000-01-01'
  const date = new Date(habit.created_at.replace(' ', 'T') + 'Z')
  const created = Number.isNaN(date.getTime()) ? habit.created_at.slice(0, 10) : localDay(date)
  return habit.log?.reduce((start, day) => day < start ? day : start, created) || created
}

export function weekReport(habits, days, today) {
  let done = 0, possible = 0
  const counts = days.map(day => {
    let count = 0
    for (const habit of habits) {
      if (day > today || day < createdDay(habit)) continue
      possible += 1
      if (habit.log.includes(day)) { count += 1; done += 1 }
    }
    return count
  })
  return { done, possible, percent: possible ? Math.round(done / possible * 100) : 0, counts }
}
