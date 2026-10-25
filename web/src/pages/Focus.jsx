import { useEffect, useRef, useState } from 'react'
import { api, buzz, clock, hms } from '../api.js'
import { Icon } from '../icons.jsx'
import { Bars, PageHead, Skeleton, useData } from '../ui.jsx'
import { newSessionId, readStored, writeStored } from '../storage.js'
import { focusElapsed as elapsed } from '../timers.js'

const KEY = 'focus.run'
const load = () => {
  try {
    const run = readStored(KEY)
    if (!run || !Number.isFinite(run.acc) || !Number.isFinite(run.target)
      || (run.since !== null && !Number.isFinite(run.since)) || typeof run.startedAt !== 'string') return null
    return { ...run, id: run.id || newSessionId() }
  } catch { return null }
}
const save = run => writeStored(KEY, run)

function Running({ run, setRun, topics, onFinish }) {
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const update = () => tick(n => n + 1)
    const t = setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', update) }
  }, [])

  const secs = elapsed(run)
  const topic = topics.find(t => t.id === run.topicId)
  const left = run.target ? run.target - secs : 0
  const over = run.target && left <= 0

  useEffect(() => { if (over) buzz('heavy') }, [over])

  const set = r => { save(r); setRun(r) }
  const finish = async () => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    const stopped = { ...run, acc: secs, since: null, finished: true }
    save(stopped); setRun(stopped)
    try {
      if (secs >= 5) await api('/focus/sessions',
        { client_id: run.id, topic_id: run.topicId, started_at: run.startedAt, duration_seconds: secs })
      save(null); setRun(null); onFinish()
    } catch {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card grid focus-running fade" style={{ gap: 22, placeItems: 'center', padding: 28 }}>
      <span className="pill">
        {topic?.name || 'Без темы'}
      </span>
      <div className="timer">
        {run.target ? clock(Math.max(0, left)) : clock(secs)}
      </div>
      {over && <b>Хорошая работа. Время вышло.</b>}
      <div className="row">
        <button disabled={busy || run.finished} className="btn ghost lg row" style={{ gap: 8 }}
                onClick={() => set(run.since
                  ? { ...run, acc: elapsed(run), since: null }
                  : { ...run, since: Date.now() })}>
          <Icon name={run.since ? 'pause' : 'play'} size={18} stroke="currentColor" width={2.2} />
          {run.since ? 'Пауза' : 'Продолжить'}
        </button>
        <button className="btn lg" onClick={finish} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Завершить'}
        </button>
      </div>
      <small>{secs >= 5 ? `Сохраним ${hms(secs)} сосредоточенной работы` : 'Немного времени только для этой задачи'}</small>
    </div>
  )
}

function Start({ topics, reloadTopics, onStart }) {
  const [topicId, setTopicId] = useState(null)
  const [mins, setMins] = useState(25)
  const [mode, setMode] = useState('down')
  const [name, setName] = useState('')

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card grid">
        <h3>Чему посвятим время?</h3>
        <div className="scroll-x">
          <button className={'chip' + (!topicId ? ' on' : '')} onClick={() => setTopicId(null)}>Без темы</button>
          {topics.map(t => (
            <button key={t.id} className={'chip' + (topicId === t.id ? ' on' : '')}
                    style={{ '--c': t.color }} onClick={() => setTopicId(t.id)}>{t.name}</button>
          ))}
        </div>
        <div className="row">
          <input placeholder="новая тема (Английский, Математика…)" value={name}
                 onChange={e => setName(e.target.value)} />
          <button className="btn" disabled={!name.trim()} style={{ padding: 13, flex: '0 0 auto' }}
                  aria-label="добавить тему" onClick={async () => {
                    const t = await api('/focus/topics', { name })
                    setName(''); reloadTopics(); setTopicId(t.id)
                  }}>
            <Icon name="plus" size={20} stroke="#fff" width={2.4} />
          </button>
        </div>
      </div>

      <div className="card grid">
        <div className="seg">
          <button className={mode === 'down' ? 'on' : ''} onClick={() => setMode('down')}>Обратный отсчёт</button>
          <button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Секундомер</button>
        </div>
        {mode === 'down' && (
          <div className="scroll-x">
            {[15, 25, 45, 60, 90].map(m => (
              <button key={m} className={'chip' + (mins === m ? ' on' : '')}
                      style={{ '--c': 'var(--focus)' }} onClick={() => setMins(m)}>{m} мин</button>
            ))}
          </div>
        )}
        <button className="btn lg wide row" style={{
          background: 'var(--focus)', boxShadow: '0 4px 0 var(--focus-lip)', justifyContent: 'center', gap: 9,
        }} onClick={() => onStart({
          id: newSessionId(), topicId: topicId || null, acc: 0, since: Date.now(),
          startedAt: new Date().toISOString(),
          target: mode === 'down' ? mins * 60 : 0,
        })}>
          <Icon name="play" size={18} stroke="#fff" width={2.2} />
          Начать фокус
        </button>
      </div>
    </div>
  )
}

export default function Focus() {
  const [run, setRun] = useState(load)
  const [period, setPeriod] = useState('week')
  const [topics, reloadTopics] = useData('/focus/topics')
  const [stats, reloadStats] = useData(`/focus/stats?period=${period}`)

  if (!topics) return <Skeleton />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <PageHead eyebrow="ВРЕМЯ ДЛЯ ГЛАВНОГО" title={<>Одна задача.<br /><em>Всё внимание.</em></>} />

      {run && <Running run={run} setRun={setRun} topics={topics} onFinish={reloadStats} />}
      {!run && <Start topics={topics} reloadTopics={reloadTopics}
                      onStart={r => { save(r); setRun(r) }} />}

      <div className="seg">
        {[['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц']].map(([k, l]) => (
          <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>
        ))}
      </div>

      {!stats ? <Skeleton n={2} /> : (
        <div className="grid auto fade">
          <div className="card grid" style={{ gap: 10 }}>
            <small>всего за период</small>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.035em' }}>{hms(stats.total) || '0м'}</div>
            <Bars color="var(--focus)" format={hms}
                  data={stats.days.map(d => ({ label: d.date.slice(5), value: d.seconds }))} />
          </div>

          <div className="card grid" style={{ gap: 10 }}>
            <h3>По темам</h3>
            {!stats.by_topic.length ? <small className="muted">пока нет сессий</small>
              : stats.by_topic.map(t => (
                <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <small style={{ fontWeight: 600, color: 'var(--text)' }}>{t.name}</small>
                    <small style={{ fontWeight: 700 }}>{hms(t.s)}</small>
                  </div>
                  <div className="meter" style={{ '--c': t.color }}>
                    <i style={{ width: `${t.s / stats.total * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>

          <div className="card grid" style={{ gap: 7 }}>
            <h3>Последние сессии</h3>
            {!stats.recent.length ? <small className="muted">пусто</small>
              : stats.recent.map(s => (
                <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <small>{s.topic || 'Без темы'} · {s.started_at.slice(5, 16).replace('T', ' ')}</small>
                  <small style={{ fontWeight: 700, color: 'var(--text)' }}>{hms(s.duration_seconds)}</small>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
