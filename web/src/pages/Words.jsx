import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, buzz, days, plural, say } from '../api.js'
import { Icon } from '../icons.jsx'
import { Bars, Empty, PageHead, Skeleton, useData, useDebounced } from '../ui.jsx'
import { WordForm } from './WordForm.jsx'

const norm = s => s.trim().toLowerCase().replace(/[.,!?;]/g, '')
const matches = (given, truth) => truth.split(/[;,/]/).some(t => norm(t) && norm(t) === norm(given))
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1])
const GRADES = [[1, 'Не знал', 'danger'], [3, 'Сложно', 'focus'], [5, 'Знал', 'habits']]

function Train({ onDone }) {
  const [deck] = useData('/words/due', [], { live: false })
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(0)
  const touch = useRef(0)
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)

  const card = deck?.cards[i]
  const mode = !card ? null : card.reps === 0 ? new Set(deck.pool).size >= 3 ? 'mc' : 'new' : i % 2 ? 'reverse' : 'type'
  const options = useMemo(() => {
    if (!card || mode !== 'mc') return []
    const wrong = shuffle([...new Set(deck.pool)].filter(p => p !== card.translation)).slice(0, 3)
    return shuffle([card.translation, ...wrong])
  }, [card?.id, mode])

  if (!deck) return <Skeleton n={1} />
  if (!deck.cards.length) return <Empty icon="trophy" title="На сегодня всё повторено"
    hint="Возвращайся завтра или добавь новые слова." />
  if (!card) return <Empty icon="check" title={`Готово: ${done} ${plural(done, 'карточка', 'карточки', 'карточек')}`}
    action={<button className="btn" onClick={onDone}>К словарю</button>} />

  const grade = async q => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      buzz(q === 5 ? 'light' : 'medium')
      await api(`/words/${card.id}/review`, { quality: q })
      setDone(d => d + 1); setShown(false); setTyped(''); setI(i + 1)
    } catch {
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const reveal = () => { setShown(true); if (mode !== 'reverse') say(card.text, card.language) }
  const front = mode === 'reverse' ? card.translation : card.text
  const back = mode === 'reverse' ? card.text : card.translation
  const label = mode === 'mc' ? 'новое слово · выбор ответа' : mode === 'new' ? 'новое слово' : mode === 'reverse' ? 'наоборот' : 'перевод'

  return (
    <div className="grid fade narrow" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <small style={{ fontWeight: 700 }}>Карточка {i + 1} из {deck.cards.length}</small>
        <span className="pill" style={{ background: 'var(--words-soft)', color: 'var(--words)' }}>{label}</span>
      </div>

      <div className="pips" style={{ '--c': 'var(--words)' }}>
        {deck.cards.map((c, n) => <i key={c.id} className={n < i ? 'on' : ''} />)}
      </div>

      <div key={card.id} className="flash fade"
           onTouchStart={e => (touch.current = e.touches[0].clientX)}
           onTouchEnd={e => {
             const dx = e.changedTouches[0].clientX - touch.current
             if (shown && Math.abs(dx) > 60) grade(dx > 0 ? 5 : 1)
           }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="word">{front}</span>
          {card.transcription && mode !== 'reverse' && <small>[{card.transcription}]</small>}
        </div>

        {mode === 'mc' && !shown && (
          <div className="grid" style={{ width: '100%', gap: 10 }}>
            {options.map(o => (
              <button key={o} className="btn ghost" style={{ fontWeight: 600 }}
                      onClick={() => { setTyped(o); setShown(true) }}>{o}</button>
            ))}
          </div>
        )}

        {['type', 'reverse'].includes(mode) && !shown && (
          <form style={{ width: '100%' }} onSubmit={e => { e.preventDefault(); reveal() }}>
            <input value={typed} placeholder="перевод…" style={{ textAlign: 'center' }}
                   onChange={e => setTyped(e.target.value)} />
          </form>
        )}

        <div className={'reveal' + (shown ? ' open' : '')} aria-hidden={!shown}><div>
          <div className="grid" style={{ gap: 16 }}><hr /><span className="answer">{back}</span>
            {typed && <small>{matches(typed, back) ? 'Верно' : `Твой ответ: ${typed}`}</small>}
            {card.example && <p className="example-note">{card.example}</p>}
          </div>
        </div></div>
      </div>

      {!shown
        ? <button className="btn ghost wide lg" onClick={reveal}>Не знаю / показать ответ</button>
        : (
          <>
            <div className="grades">
              {GRADES.map(([q, text, c]) => (
                <button key={q} className="grade" disabled={busy} onClick={() => grade(q)}
                        style={{ '--c': `var(--${c})`, '--c-lip': `var(--${c}-lip)` }}>
                  <b>{text}</b>
                  <span>{days(card.preview?.[q] ?? 1)}</span>
                </button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <Icon name="left" size={15} stroke="var(--muted-2)" width={2.2} />
              <small style={{ color: 'var(--muted-2)', fontWeight: 600 }}>свайп: не знал · знал</small>
              <Icon name="right" size={15} stroke="var(--muted-2)" width={2.2} />
            </div>
          </>
        )}
    </div>
  )
}

function Importer() {
  const [csv, setCsv] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  return <details className="card"><summary>Импорт из CSV</summary><div className="grid" style={{ marginTop: 18 }}>
    <small>Первая строка: text,translation,language,transcription,example,list</small>
    <textarea rows={5} aria-label="Содержимое CSV" value={csv} onChange={e => setCsv(e.target.value)} placeholder={'text,translation,language,transcription,example,list\napple,яблоко,en,,,Еда'} />
    <button className="btn" disabled={busy || !csv.trim()} onClick={async () => { setBusy(true); try { setResult(await api('/words/import', { csv })) } catch {} finally { setBusy(false) } }}>{busy ? 'Импортируем…' : 'Импортировать'}</button>
    {result && <small role="status">Добавлено {result.added}, дублей пропущено {result.skipped_duplicates}</small>}
  </div></details>
}

function NewList() {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return <form className="card row" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); try { await api('/lists', { name }); setName('') } catch {} finally { setBusy(false) } }}>
    <input placeholder="Новая коллекция" aria-label="Название коллекции" value={name} onChange={e => setName(e.target.value)} />
    <button className="btn" disabled={busy || !name.trim()} aria-label="Добавить коллекцию"><Icon name="plus" size={20} /></button>
  </form>
}

function WordRow({ word, from }) {
  const navigate = useNavigate()
  const label = word.interval >= 21 ? 'Выучено' : word.reps ? 'В работе' : 'Новое'
  return <article className="word-row"><Link to={`/words/${word.id}`} onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); navigate(`/words/${word.id}`, { state: { from, scrollY: window.scrollY } })
  }}>
    <h3>{word.text}</h3>{word.transcription && <small>{word.transcription}</small>}<p>{word.translation}</p>
    <div className="word-row-meta"><span className="pill">{label}</span>{word.list_name && <small>{word.list_name}</small>}{word.language === 'zh' && <small>中文</small>}</div>
  </Link><button className="icon-button" aria-label={`Произнести ${word.text}`} onClick={() => say(word.text, word.language)}><Icon name="speaker" size={19} /></button></article>
}

function WordList({ lists, params, setParams }) {
  const location = useLocation()
  const search = params.get('q') || ''
  const debounced = useDebounced(search)
  const page = Math.max(0, Number(params.get('page')) || 0)
  const language = params.get('language') || ''
  const listId = params.get('list') || '0'
  const [words] = useData(`/words?search=${encodeURIComponent(debounced)}&list_id=${Number(listId) || 0}&language=${language}&limit=81&offset=${page * 80}`)
  const update = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next, { replace: true }) }
  useEffect(() => {
    if (words && Number.isFinite(location.state?.restoreScroll)) {
      const frame = requestAnimationFrame(() => window.scrollTo(0, location.state.restoreScroll))
      return () => cancelAnimationFrame(frame)
    }
  }, [words, location.key])
  return <div className="grid" style={{ gap: 17 }}>
    <div style={{ position: 'relative' }}><Icon name="search" size={19} style={{ position: 'absolute', left: 15, top: 14, color: 'var(--muted)' }} /><input placeholder="Найти слово или перевод" aria-label="Поиск по словарю" value={search} style={{ paddingLeft: 44 }} onChange={e => update('q', e.target.value)} /></div>
    <div className="seg">{[['', 'Все'], ['en', 'English'], ['zh', '中文']].map(([value, name]) => <button key={value} className={language === value ? 'on' : ''} onClick={() => update('language', value)}>{name}</button>)}</div>
    {lists.length > 0 && <div className="scroll-x"><button className={'chip' + (listId === '0' ? ' on' : '')} onClick={() => update('list', '')}>Все коллекции</button>{lists.map(list => <button key={list.id} className={'chip' + (listId === String(list.id) ? ' on' : '')} onClick={() => update('list', String(list.id))}>{list.name} · {list.n}</button>)}</div>}
    {!words ? <Skeleton /> : !words.length ? <Empty icon="book" title={search || language || listId !== '0' ? 'Ничего не нашлось' : 'Твоя коллекция начинается здесь'} hint={search ? 'Попробуй другое слово или перевод.' : 'Добавь слово, которое хочется запомнить.'} /> : <div className="word-list">{words.slice(0, 80).map(word => <WordRow key={word.id} word={word} from={location.pathname + location.search} />)}</div>}
    {(page > 0 || words?.length > 80) && <div className="row" style={{ justifyContent: 'space-between' }}><button className="btn ghost" disabled={page === 0} onClick={() => update('page', String(page - 1))}>Назад</button><small>Страница {page + 1}</small><button className="btn ghost" disabled={!words || words.length <= 80} onClick={() => update('page', String(page + 1))}>Дальше</button></div>}
  </div>
}

export default function Words() {
  const [params, setParams] = useSearchParams()
  const tab = ['train', 'add'].includes(params.get('view')) ? params.get('view') : 'list'
  const [lists] = useData(tab === 'train' ? null : '/lists')
  const [stats] = useData('/words/stats')
  const change = view => { const next = new URLSearchParams(params); if (view === 'list') next.delete('view'); else next.set('view', view); setParams(next); window.scrollTo(0, 0) }
  return <div className="grid fade" style={{ gap: 23 }}>
    <PageHead title={tab === 'train' ? 'Повторение.' : tab === 'add' ? 'Новое слово.' : 'Твой словарь.'} subtitle={stats && `${stats.total} ${plural(stats.total, 'слово', 'слова', 'слов')} в коллекции · English / 中文`} action={tab === 'list' && <button className="icon-button" aria-label="Добавить слово" onClick={() => change('add')}><Icon name="plus" /></button>} />
    {tab === 'list' && <>
      {stats?.due > 0 && <Link className="dictionary-train-link" to={'/words?' + new URLSearchParams({ ...Object.fromEntries(params), view: 'train' })}><Icon name="book" size={29} /><span className="grow"><strong>{stats.due} на повторении</strong><small>Несколько минут для памяти</small></span><Icon name="arrow" /></Link>}
      {stats && <div className="dictionary-stats"><span><b>{stats.new}</b> новых</span><span><b>{stats.learning}</b> в работе</span><span><b>{stats.learned}</b> выучено</span></div>}
      {lists ? <WordList lists={lists} params={params} setParams={setParams} /> : <Skeleton />}
      {stats?.days.length > 2 && <details className="card"><summary>История повторений</summary><div style={{ marginTop: 20 }}><Bars color="var(--primary)" data={stats.days.map(day => ({ label: day.d.slice(5), value: day.n }))} /></div></details>}
      <button className="btn ghost" onClick={() => change('add')}><Icon name="plus" size={18} />Добавить слово</button>
    </>}
    {tab === 'train' && <Train onDone={() => change('list')} />}
    {tab === 'add' && (lists ? <div className="grid"><WordForm lists={lists} onSaved={() => change('list')} onCancel={() => change('list')} /><NewList /><Importer /></div> : <Skeleton />)}
  </div>
}
