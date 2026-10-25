import { useMemo, useRef, useState } from 'react'
import { api, dayWord, isoDay } from '../api.js'
import { useHabitToggle } from '../habit-actions.jsx'
import { calendarWeek, createdDay, weekReport } from '../habit-logic.js'
import { HabitSymbol, Icon } from '../icons.jsx'
import { useBackAction } from '../navigation.jsx'
import { Bars, Empty, HABIT_COLORS, HABIT_ICONS, Heatmap, Looks, PageHead, Skeleton, Tools, useData } from '../ui.jsx'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function Add({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', icon: HABIT_ICONS[0], color: HABIT_COLORS[0] })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useBackAction(() => { if (!form.name.trim() || confirm('Закрыть без сохранения привычки?')) onCancel() })
  const save = async event => {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { await api('/habits', form); onDone() } catch {} finally { lock.current = false; setBusy(false) }
  }
  return <form className="card grid habit-form fade" onSubmit={save}>
    <h3>Новый ритуал</h3><input autoFocus aria-label="Название привычки" placeholder="Например, читать 20 минут" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
    <Looks f={form} set={setForm} /><div className="row"><button className="btn wide" disabled={busy || !form.name.trim()}>{busy ? 'Сохраняем…' : 'Добавить привычку'}</button><button type="button" className="btn ghost" onClick={onCancel}>Отмена</button></div>
  </form>
}

function HabitRow({ habit, days, today, expanded, onExpand, toggle, busy, reload }) {
  const [picked, setPicked] = useState('')
  const log = useMemo(() => new Set(habit.log), [habit.log])
  const count = days.filter(day => log.has(day)).length
  const possible = days.filter(day => day <= today && day >= createdDay(habit)).length
  const change = day => { setPicked(day); toggle(habit, day) }
  return <article className="habit-matrix-row">
    <div className="habit-row-heading"><button className="habit-row-title" aria-expanded={expanded} onClick={onExpand}>
      <span className="row" style={{ color: habit.color }}><HabitSymbol value={habit.icon} size={20} /></span><span>{habit.name}</span><Icon name="chevron" size={13} style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
    </button><small>{count}/{possible}</small></div>
    <div className="habit-week">{days.map(day => <button key={day} type="button" className={'habit-cell' + (log.has(day) ? ' on' : '') + (day === today ? ' today' : '') + (day > today ? ' future' : '') + (day === picked ? ' picked' : '')}
      disabled={busy || day > today} aria-label={`${habit.name}, ${day}`} aria-pressed={log.has(day)} onClick={() => change(day)}><Icon name="check" size={17} /></button>)}</div>
    {expanded && <div className="habit-details fade"><div className="row" style={{ justifyContent: 'space-between' }}><small>{habit.streak} {dayWord(habit.streak)} подряд</small><small>Рекорд: {habit.best} {dayWord(habit.best)}</small></div>
      <Heatmap done={habit.log} color="var(--primary)" onPick={busy ? undefined : change} /><small>Выбери день в истории, чтобы изменить отметку.</small>
      <Tools h={habit} reload={reload}><input type="date" max={today} aria-label="Отметить другую дату" disabled={busy} onChange={e => { if (e.target.value) change(e.target.value); e.target.value = '' }} style={{ width: 160 }} /></Tools>
    </div>}
  </article>
}

export default function Habits() {
  const [all, reload] = useData('/habits')
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [offset, setOffset] = useState(0)
  const { toggle, pending } = useHabitToggle()
  useBackAction(() => setExpanded(null), expanded != null && !adding)
  const today = isoDay()
  const days = calendarWeek(today, offset)
  const active = all?.filter(h => !h.count_from && !h.archived) || []
  const archived = all?.filter(h => !h.count_from && h.archived) || []
  const report = weekReport(active, days, today)
  const best = Math.max(0, ...active.map(h => h.streak))
  const range = `${new Date(days[0] + 'T12:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'short' })} — ${new Date(days[6] + 'T12:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'short' })}`
  return <div className="grid fade" style={{ gap: 22 }}>
    <PageHead eyebrow="ПРИВЫЧКИ / ТВОЙ РИТМ" title={<>Хороший<br /><em>темп.</em></>} action={<button className="icon-button" aria-label={adding ? 'Закрыть новую привычку' : 'Добавить привычку'} onClick={() => setAdding(value => !value)}><Icon name={adding ? 'close' : 'plus'} /></button>} />
    {adding && <Add onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />}
    {!all ? <Skeleton /> : !active.length ? <Empty icon="habits" title="Начни с маленького ритуала" hint="Стакан воды, несколько страниц или короткая прогулка." action={!adding && <button className="btn" onClick={() => setAdding(true)}>Добавить привычку</button>} /> : <>
      <div className="habit-week-controls"><button className="icon-button" aria-label="Предыдущая неделя" disabled={offset <= -16} onClick={() => setOffset(value => value - 1)}><Icon name="left" size={17} /></button><span>{range}</span><button className="icon-button" aria-label="Следующая неделя" disabled={offset === 0} onClick={() => setOffset(value => value + 1)}><Icon name="right" size={17} /></button></div>
      <section aria-label="Недельный календарь привычек"><div className="habit-week">{days.map((day, i) => <span key={day} className={'habit-week-label' + (day === today ? ' today' : '')}>{DAYS[i]}<strong>{Number(day.slice(-2))}</strong></span>)}</div>
        {active.map(habit => <HabitRow key={habit.id} habit={habit} days={days} today={today} expanded={expanded === habit.id} onExpand={() => setExpanded(expanded === habit.id ? null : habit.id)} toggle={toggle} busy={pending.has(habit.id)} reload={reload} />)}
      </section>
      <section className="habit-report" aria-label="Отчёт за неделю"><div className="streak-strip"><strong>{best}</strong><span>{dayWord(best)} подряд<small>Самая длинная текущая серия</small></span><Icon name="habits" size={32} style={{ marginLeft: 'auto', color: 'var(--focus)' }} /></div>
        <div className="report-totals"><strong>{report.percent}<small>%</small></strong><small>{report.done} ИЗ {report.possible} ОТМЕТОК ЗА НЕДЕЛЮ</small></div><Bars color="var(--primary)" data={report.counts.map((value, i) => ({ value, label: DAYS[i] }))} />
      </section>
    </>}
    {archived.length > 0 && <details className="habit-archive"><summary>В архиве · {archived.length}</summary><div className="grid" style={{ marginTop: 16 }}>{archived.map(habit => <div key={habit.id} className="card grid"><h3>{habit.name}</h3><Tools h={habit} reload={reload} /></div>)}</div></details>}
  </div>
}
