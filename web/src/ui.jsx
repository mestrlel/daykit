import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api, resources, isoDay } from './api.js'
import { HabitSymbol, Icon } from './icons.jsx'

export const Empty = ({ icon, title, hint, action }) => (
  <div className="empty fade">
    <Icon name={icon} size={44} stroke="currentColor" width={1.5} />
    <h3 style={{ marginTop: 10, color: 'var(--text)' }}>{title}</h3>
    {hint && <p className="muted" style={{ maxWidth: 320, margin: '6px auto 16px' }}>{hint}</p>}
    {action}
  </div>
)

export const Skeleton = ({ n = 3 }) =>
  <div className="grid">{Array.from({ length: n }, (_, i) => <div key={i} className="skel" />)}</div>

export const Bars = ({ data, color, format = v => v }) => {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <>
      <div className="bars" style={{ '--c': color }}>
        {data.map((d, i) => (
          <div key={i} style={{ height: `${Math.round(d.value / max * 100)}%` }}
               title={`${d.label}: ${format(d.value)}`} />
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <small>{data[0]?.label}</small><small>{data.at(-1)?.label}</small>
      </div>
    </>
  )
}

export const Heatmap = ({ done, color, weeks = 17, onPick }) => {
  const set = new Set(done)
  const today = isoDay()
  const end = new Date(); end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)))
  const days = []
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i)
    days.push(isoDay(d))
  }
  return (
    <div className="heat" style={{ '--c': color }}>
      {days.map(d => {
        const future = d > today
        return <button type="button" key={d} className={set.has(d) ? 'on' : ''} title={d}
                     aria-label={`${d}${set.has(d) ? ', выполнено' : ', не отмечено'}`}
                     disabled={!onPick || future}
                     aria-pressed={set.has(d)}
                     onClick={onPick && !future ? () => onPick(d) : undefined}
                     style={{ opacity: future ? .3 : 1, cursor: onPick && !future ? 'pointer' : 'default' }} />
      })}
    </div>
  )
}

export function useData(path, deps = [], { live = true } = {}) {
  const subscribe = useCallback(listener => resources.subscribe(path, listener, live), [path, live])
  const snapshot = useSyncExternalStore(subscribe, () => resources.snapshot(path))
  useEffect(() => { resources.read(path) }, [path, ...deps])
  useEffect(() => {
    if (!path || !live) return
    const refresh = () => { if (document.visibilityState === 'visible') resources.read(path) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [path, live])
  const reload = useCallback(() => resources.read(path, true), [path])
  return [snapshot.data, reload, snapshot.error]
}

export function useDebounced(value, delay = 250) {
  const [result, setResult] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return result
}

export const PageHead = ({ eyebrow, title, subtitle, action }) => (
  <header className="page-head">
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>
    {action}
  </header>
)

export const HABIT_COLORS = ['#F3F3F3', '#D5E5AB', '#C3B6FA', '#EDBC92', '#9AC9DF', '#E9A7B4']
export const HABIT_ICONS = ['habits', 'book', 'activity', 'drop', 'focus', 'moon', 'sun', 'music', 'calendar', 'heart', 'plane', 'target']
const ICON_LABELS = ['Рост', 'Чтение', 'Движение', 'Вода', 'Внимание', 'Сон', 'Утро', 'Музыка', 'Дата', 'Забота', 'Путешествие', 'Цель']
const COLOR_LABELS = ['Светлый', 'Зелёный', 'Лиловый', 'Персиковый', 'Голубой', 'Розовый']

export const delHabit = async (h, reload) => {
  const warn = h.count_from ? '' : ' Вся история отметок пропадёт.'
  if (confirm(`Удалить «${h.name}»?${warn}`)) { await api(`/habits/${h.id}`, null, 'DELETE'); reload() }
}

export const Tools = ({ h, reload, children }) => (
  <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
    {children}
    <button className="btn ghost" style={{ padding: '7px 13px', fontSize: 13, fontWeight: 600 }}
            onClick={async () => {
              const name = prompt('Название', h.name)
              if (name) { await api(`/habits/${h.id}`, { name }, 'PATCH'); reload() }
            }}>переименовать</button>
    {!h.count_from && (
      <button className="btn ghost" style={{ padding: '7px 13px', fontSize: 13, fontWeight: 600 }}
              onClick={async () => { await api(`/habits/${h.id}`, { archived: h.archived ? 0 : 1 }, 'PATCH'); reload() }}>
        {h.archived ? 'вернуть' : 'в архив'}
      </button>
    )}
    <button className="btn ghost" style={{ padding: '7px 13px', fontSize: 13, fontWeight: 600, color: 'var(--danger)' }}
            onClick={() => delHabit(h, reload)}>удалить</button>
  </div>
)

export const Looks = ({ f, set }) => (
  <>
    <div className="scroll-x">
      {HABIT_ICONS.map((i, index) => (
        <button key={i} className={'chip' + (f.icon === i ? ' on' : '')}
                style={{ '--c': f.color, fontSize: 17, padding: '6px 13px' }}
                aria-label={ICON_LABELS[index]} aria-pressed={f.icon === i} type="button" onClick={() => set({ ...f, icon: i })}><HabitSymbol value={i} /></button>
      ))}
    </div>
    <div className="scroll-x">
      {HABIT_COLORS.map((c, index) => (
        <button type="button" key={c} onClick={() => set({ ...f, color: c })} aria-label={COLOR_LABELS[index]} aria-pressed={f.color === c}
                style={{
                  width: 34, height: 34, flex: '0 0 auto', borderRadius: 999, background: c,
                  border: 'none', cursor: 'pointer',
                  boxShadow: f.color === c ? `0 0 0 3px var(--surface), 0 0 0 6px ${c}` : '0 3px 0 rgba(0,0,0,.18)',
                }} />
      ))}
    </div>
  </>
)
