import { useRef, useState } from 'react'
import { api, dayWord, isoDay } from '../api.js'
import { HabitSymbol, Icon } from '../icons.jsx'
import { useBackAction } from '../navigation.jsx'
import { Empty, HABIT_COLORS, Looks, PageHead, Skeleton, Tools, useData } from '../ui.jsx'

function Add({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', icon: 'calendar', color: HABIT_COLORS[0], count_from: isoDay() })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useBackAction(() => { if (!form.name.trim() || confirm('Закрыть без сохранения даты?')) onCancel() })
  return <form className="card grid fade" onSubmit={async event => { event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); try { await api('/habits', form); onDone() } catch {} finally { lock.current = false; setBusy(false) } }}>
    <h3>Важная дата</h3><input autoFocus aria-label="Название события" placeholder="Путешествие, годовщина, новый этап…" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
    <input type="date" aria-label="Дата события" value={form.count_from} onChange={e => setForm({ ...form, count_from: e.target.value })} /><Looks f={form} set={setForm} />
    <div className="row"><button className="btn wide" disabled={busy || !form.name.trim() || !form.count_from}>{busy ? 'Сохраняем…' : 'Сохранить дату'}</button><button type="button" className="btn ghost" onClick={onCancel}>Отмена</button></div>
  </form>
}

function Counter({ counter, reload }) {
  const n = counter.days_since
  return <article className="card counter-card grid" style={{ gap: 14 }}>
    <div className="counter-name"><span style={{ color: counter.color }}><HabitSymbol value={counter.icon} /></span><h3>{counter.name}</h3></div>
    <div><p className="counter-value">{n === 0 ? 'Сегодня' : <>{Math.abs(n)}<span>{dayWord(Math.abs(n))}</span></>}</p><p className="counter-date">{n < 0 ? 'До ' : 'С '}{new Date(counter.count_from + 'T12:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <details><summary className="muted">Изменить событие</summary><div style={{ marginTop: 16 }}><Tools h={counter} reload={reload}><input type="date" defaultValue={counter.count_from} aria-label={`Изменить дату ${counter.name}`} style={{ width: 165 }} onChange={async event => { if (!event.target.value) return; try { await api(`/habits/${counter.id}`, { count_from: event.target.value }, 'PATCH') } catch { event.target.value = counter.count_from } }} /></Tools></div></details>
  </article>
}

export default function Counters() {
  const [all, reload] = useData('/habits')
  const [adding, setAdding] = useState(false)
  const list = all?.filter(h => h.count_from && !h.archived).sort((a, b) => (a.days_since < 0 ? 0 : 1) - (b.days_since < 0 ? 0 : 1) || Math.abs(a.days_since) - Math.abs(b.days_since))
  return <div className="grid fade" style={{ gap: 22 }}>
    <PageHead eyebrow="ДНИ, КОТОРЫЕ ВАЖНЫ" title={<>В предвкушении<br /><em>и на память.</em></>} action={<button className="icon-button" aria-label={adding ? 'Закрыть новую дату' : 'Добавить отсчёт'} onClick={() => setAdding(value => !value)}><Icon name={adding ? 'close' : 'plus'} /></button>} />
    {adding && <Add onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />}
    {!list ? <Skeleton /> : !list.length ? <Empty icon="calendar" title="Сохрани важную дату" hint="День встречи, начало нового дела или путешествие, которого ждёшь." action={!adding && <button className="btn" onClick={() => setAdding(true)}>Добавить отсчёт</button>} /> : <div className="grid auto">{list.map(counter => <Counter key={counter.id} counter={counter} reload={reload} />)}</div>}
  </div>
}
