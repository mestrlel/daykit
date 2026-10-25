import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { dayWord, hms, isoDay, plural, resources, tg } from './api.js'
import { useHabitToggle } from './habit-actions.jsx'
import { HabitSymbol, Icon } from './icons.jsx'
import { useNavigation } from './navigation.jsx'
import { readStored } from './storage.js'
import { focusElapsed } from './timers.js'
import { Skeleton, useData } from './ui.jsx'

const Words = lazy(() => import('./pages/Words.jsx'))
const WordPage = lazy(() => import('./pages/WordPage.jsx'))
const Habits = lazy(() => import('./pages/Habits.jsx'))
const Counters = lazy(() => import('./pages/Counters.jsx'))
const Focus = lazy(() => import('./pages/Focus.jsx'))
const NAV = [['/', 'home', 'Сегодня'], ['/habits', 'habits', 'Привычки'], ['/words', 'book', 'Словарь'], ['/more', 'more', 'Ещё']]
const MORE = [['/focus', 'timer', 'Фокус'], ['/counters', 'calendar', 'Отсчёты']]

function HomeHabit({ habit }) {
  const { toggle, pending } = useHabitToggle()
  return <div className="home-habit">
    <span className="habit-symbol" style={{ color: habit.color }}><HabitSymbol value={habit.icon} /></span>
    <div className="grow"><b>{habit.name}</b><small>{habit.streak} {dayWord(habit.streak)} подряд</small></div>
    <button className={'check-button' + (habit.today ? ' done' : '')} disabled={pending.has(habit.id)}
            aria-pressed={habit.today} aria-label={`${habit.name}: отметить сегодня`} onClick={() => toggle(habit)}><Icon name="check" size={18} /></button>
  </div>
}

function FocusShortcut() {
  const [run, setRun] = useState(() => readStored('focus.run'))
  useEffect(() => {
    const refresh = event => { if (event.detail?.key === 'focus.run' || event.key === 'focus.run') setRun(readStored('focus.run')) }
    window.addEventListener('app:storage', refresh); window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('app:storage', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  const [, tick] = useState(0)
  const valid = run && Number.isFinite(run.acc) && Number.isFinite(run.target)
  useEffect(() => {
    if (!valid || !run.since) return
    const timer = setInterval(() => tick(value => value + 1), 1000)
    return () => clearInterval(timer)
  }, [run, valid])
  const seconds = valid ? run.target ? Math.max(0, run.target - focusElapsed(run)) : focusElapsed(run) : 1500
  const value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return <Link to="/focus" state={{ from: '/' }} className="focus-ticket"><span className="eyebrow">ОДНА ЗАДАЧА. ВСЁ ВНИМАНИЕ.</span><span className="focus-time">{value}</span><span className="focus-caption">{valid ? run.finished ? 'Сохранить завершённую сессию' : run.since ? 'Вернуться к фокусу' : 'Твоя сессия на паузе' : 'Место для главного'}</span><span className="focus-play"><Icon name={valid && run.since ? 'timer' : 'play'} size={24} /></span></Link>
}

function Home({ summary }) {
  const [all] = useData('/habits')
  const active = all?.filter(h => !h.count_from && !h.archived) || []
  const today = new Date()
  const day = today.toLocaleDateString('ru', { weekday: 'long' })
  const month = today.toLocaleDateString('ru', { month: 'long', year: 'numeric' }).replace(' г.', '')
  const done = all ? active.filter(h => h.today).length : summary?.habits_done || 0
  const total = all ? active.length : summary?.habits_total || 0
  return <div className="home fade">
    <header className="date-heading"><span className="date-number">{today.getDate()}</span><div><span>{day}</span><small>{month}</small></div></header>
    <section className="daily-progress" aria-label="Привычки сегодня">
      <div className="section-caption"><span>ТВОЙ ДЕНЬ</span><span>{total ? `${done} / ${total}` : 'В своём темпе'}</span></div>
      <div className="day-segments" role="progressbar" aria-label="Выполненные привычки" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total || 1}>
        {Array.from({ length: total > 20 ? 1 : total || 6 }, (_, i) => <i key={i} className={i < done ? 'on' : ''}
          style={total > 20 ? { background: `linear-gradient(to right, var(--primary) ${done / total * 100}%, var(--track) ${done / total * 100}%)` } : undefined} />)}
      </div>
    </section>
    <div className="home-columns">
      <div className="home-column">
        <FocusShortcut />
        <section><div className="section-caption"><span>ПРОДОЛЖИТЬ</span><small>Немного каждый день</small></div>
          <Link to={summary?.words_due ? '/words?view=train' : '/words'} className="lesson-link"><span className="lesson-symbol"><Icon name="book" size={30} /></span><div className="grow"><b>{summary ? summary.words_due ? `${summary.words_due} ${plural(summary.words_due, 'слово ждёт', 'слова ждут', 'слов ждут')} тебя` : summary.words_total ? 'Коллекция слов' : 'Твой первый словарь' : 'Словарь'}</b><small>{summary?.words_total ? `${summary.words_total} ${plural(summary.words_total, 'слово', 'слова', 'слов')} · English / 中文` : 'Английский и китайский'}</small></div><Icon name="arrow" size={20} /></Link>
        </section>
      </div>
      <div className="home-column">
        <section><div className="section-caption"><span>ПРИВЫЧКИ</span><Link to="/habits" className="text-link">Все <Icon name="arrow" size={14} /></Link></div>
          {!all ? <Skeleton n={2} /> : !active.length ? <Link to="/habits" className="home-empty"><Icon name="habits" size={30} /><span>Добавь маленький ритуал<small>И возвращайся к нему каждый день</small></span><Icon name="plus" size={18} /></Link>
            : <div className="home-habits">{active.slice(0, 3).map(habit => <HomeHabit key={habit.id} habit={habit} />)}</div>}
        </section>
        <Link to="/counters" state={{ from: '/' }} className="date-reminder"><Icon name="calendar" size={22} /><div className="grow"><small>{summary?.nearest?.name || 'Важные даты'}</small><b>{summary?.nearest ? `${Math.abs(summary.nearest.days)} ${dayWord(Math.abs(summary.nearest.days))} ${summary.nearest.days < 0 ? 'осталось' : 'прошло'}` : 'Сохрани то, что ждёшь'}</b></div><Icon name="chevron" size={16} /></Link>
      </div>
    </div>
  </div>
}

function More({ summary }) {
  return <div className="grid fade" style={{ gap: 24 }}><header className="page-head"><div><p className="eyebrow">ТВОЁ ПРОСТРАНСТВО</p><h1>Ещё немного<br /><em>для себя.</em></h1></div></header><div className="more-grid">
    {MORE.map(([to, icon, title]) => <Link key={to} to={to} state={{ from: '/more' }} className={'module-link module-' + icon}><Icon name={icon} size={32} /><h2>{title}</h2><p>{to === '/focus' ? summary?.focus_week ? `${hms(summary.focus_week)} за неделю` : 'Время для одной задачи' : 'Дни до и после важного'}</p><Icon name="arrow" size={20} /></Link>)}
  </div></div>
}

export default function App() {
  const { pathname } = useLocation()
  const [summary] = useData('/summary', [pathname])
  const [error, setError] = useState('')
  const [, updateDay] = useState(isoDay)
  const { back, visible, native } = useNavigation()
  useEffect(() => {
    const handler = event => setError(event.detail)
    window.addEventListener('app:error', handler)
    return () => window.removeEventListener('app:error', handler)
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    let timer
    const schedule = () => {
      const next = new Date(); next.setHours(24, 0, 1, 0)
      timer = setTimeout(() => { updateDay(isoDay()); resources.invalidate(['/summary', '/habits', '/words', '/focus']); schedule() }, next.getTime() - Date.now())
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  const name = tg?.initDataUnsafe?.user?.first_name
  const nav = ([to, icon, title]) => <NavLink key={to} to={to} state={{ from: '/' }} end={to === '/'} className={({ isActive }) => 'tab' + (isActive || (to === '/more' && MORE.some(([path]) => path === pathname)) ? ' on' : '')}>
    <Icon name={icon} /><span>{title}</span>{to === '/words' && summary?.words_due > 0 && <span className="nav-dot" aria-label={`${summary.words_due} на повторении`} />}
  </NavLink>
  return <div className="app">
    <aside className="side"><Link to="/" className="brand"><Icon name="mark" size={29} />DayKit</Link><p className="nav-caption">В СВОЁМ ТЕМПЕ</p><nav aria-label="Все разделы">{[...NAV.slice(0, 3), ...MORE].map(nav)}</nav><div className="side-note"><span className="avatar">{name?.slice(0, 1) || <Icon name="mark" size={16} />}</span><span>{name || 'DayKit'}<small>Немного каждый день</small></span></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-start">{visible && !native && <button className="icon-button back-button" onClick={back} aria-label="Назад"><Icon name="left" /></button>}<Link to="/" className="brand"><Icon name="mark" size={25} />DayKit</Link></div><span className="avatar" aria-label={name || 'Личное пространство'}>{name?.slice(0, 1) || <Icon name="mark" size={16} />}</span></header>
      <main className="main">
        {error && <div className="error-notice" role="alert"><span>{error}</span><button onClick={() => { setError(''); resources.retry() }}>Повторить</button><button aria-label="Закрыть сообщение" onClick={() => setError('')}><Icon name="close" size={18} /></button></div>}
        <Suspense fallback={<Skeleton />}><Routes>
          <Route path="/" element={<Home summary={summary} />} /><Route path="/more" element={<More summary={summary} />} />
          <Route path="/words" element={<Words />} /><Route path="/words/:id" element={<WordPage />} />
          <Route path="/habits" element={<Habits />} /><Route path="/counters" element={<Counters />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="*" element={<div className="empty"><h1>Страница не найдена</h1><Link to="/">На главную</Link></div>} />
        </Routes></Suspense>
      </main>
    </div><nav className="tabbar" aria-label="Основная навигация">{NAV.map(nav)}</nav>
  </div>
}
