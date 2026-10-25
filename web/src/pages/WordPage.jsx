import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, days, say } from '../api.js'
import { Icon } from '../icons.jsx'
import { Skeleton, useData } from '../ui.jsx'
import { WordForm } from './WordForm.jsx'

const Block = ({ title, children }) => <section className="card grid" style={{ gap: 14 }}><h3>{title}</h3>{children}</section>

function Phrasal({ text, parent }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [data, reload] = useData(open ? `/words/lookup?text=${encodeURIComponent(text)}&language=en` : null)
  const translation = data?.translations.slice(0, 3).join(', ')
  return <div className="grid" style={{ gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
    <button className="text-link" aria-expanded={open} onClick={() => setOpen(value => !value)} style={{ justifyContent: 'space-between', fontSize: 15, padding: '6px 0' }}>{text}<Icon name="chevron" size={16} style={{ transform: open ? 'rotate(90deg)' : 'none' }} /></button>
    {open && (!data ? <small>Ищем перевод…</small> : <div className="grid fade" style={{ gap: 10 }}><p style={{ fontSize: 14, color: 'var(--text-2)' }}>{translation || (data.failed ? 'Словарь временно не ответил.' : 'Перевод не найден.')}</p>
      {data.failed && <button className="text-link" onClick={reload}>Попробовать снова</button>}
      {data.examples[0] && <small>{data.examples[0].text}</small>}
      {translation && <button className="btn ghost" disabled={busy || saved} onClick={async () => { setBusy(true); try { await api('/words', { text, translation, language: 'en', transcription: data.transcription, list_id: parent.list_id, force_merge: true }); setSaved(true) } catch {} finally { setBusy(false) } }}>{saved ? 'В твоём словаре' : busy ? 'Сохраняем…' : 'Добавить в словарь'}</button>}
    </div>)}
  </div>
}

export default function WordPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [word, reload] = useData(`/words/${id}`)
  const [lists] = useData('/lists')
  const [lookup, retryLookup, lookupError] = useData(word ? `/words/lookup?text=${encodeURIComponent(word.text)}&language=${word.language}` : null)
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(true)
  const [deleting, setDeleting] = useState(false)
  if (!word) return <Skeleton n={2} />
  const status = word.interval >= 21 ? 'Выучено' : word.reps ? `Повтор ${days(word.interval)}` : 'Новое слово'
  return <div className="grid fade" style={{ gap: 22 }}>
    <section className="word-hero">
      <div className="section-caption" style={{ margin: 0 }}><span style={{ color: '#5c5f68' }}>{word.language === 'zh' ? 'КИТАЙСКИЙ' : 'ENGLISH'} / РУССКИЙ</span><button className="icon-button" aria-label={`Произнести ${word.text}`} onClick={() => say(word.text, word.language)}><Icon name="speaker" size={22} /></button></div>
      <div><h1>{word.text}</h1>{(word.transcription || lookup?.transcription) && <p style={{ marginTop: 11 }}><small>{word.transcription || lookup.transcription}</small></p>}</div>
      <div className={'reveal' + (revealed ? ' open' : '')} aria-hidden={!revealed}><div><p className="word-meaning">{word.translation}</p></div></div>
      <button className="text-link" aria-expanded={revealed} style={{ color: '#575b65', fontSize: 12 }} onClick={() => setRevealed(value => !value)}>{revealed ? 'Скрыть перевод' : 'Показать перевод'}<Icon name="chevron" size={13} style={{ transform: revealed ? 'rotate(-90deg)' : 'rotate(90deg)' }} /></button>
      <div className="row" style={{ flexWrap: 'wrap', gap: 7 }}><span className="pill">{status}</span>{word.list_name && <span className="pill">{word.list_name}</span>}{word.text.includes(' ') && <span className="pill">Фраза</span>}</div>
      {word.example && <p className="example-note">{word.example}</p>}
    </section>
    <div className="word-tools"><button className="btn ghost" onClick={() => setEditing(value => !value)}><Icon name="edit" size={17} />{editing ? 'Отмена' : 'Изменить'}</button><button className="icon-button" aria-label="Удалить слово" disabled={deleting} onClick={async () => { if (!confirm(`Удалить «${word.text}»?`)) return; setDeleting(true); try { await api(`/words/${word.id}`, null, 'DELETE'); navigate('/words', { replace: true }) } catch { setDeleting(false) } }}><Icon name="trash" size={18} /></button></div>
    {editing && lists && <WordForm word={word} lists={lists} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload() }} />}
    {!lookup ? lookupError ? <Block title="Словарные материалы"><small>Не удалось загрузить примеры.</small><button className="btn ghost" onClick={retryLookup}>Повторить</button></Block> : <div className="card grid"><small>Ищем примеры и значения…</small><Skeleton n={1} /></div> : <>
      {lookup.meanings?.length > 0 && <Block title="Значения">{lookup.meanings.map((meaning, i) => <p key={i} style={{ fontSize: 14, color: 'var(--text-2)' }}>{meaning}</p>)}<small>CC-CEDICT · значения на английском</small></Block>}
      {lookup.translations.length > 0 && <Block title="Другие переводы"><div className="row" style={{ flexWrap: 'wrap' }}>{lookup.translations.map(value => <span key={value} className="pill">{value}</span>)}</div><small>Wiktionary</small></Block>}
      <Block title="В контексте">{lookup.examples.length ? lookup.examples.map((example, i) => <div key={i} className="grid" style={{ gap: 6, paddingTop: i ? 15 : 0, borderTop: i ? '1px solid var(--border)' : 0 }}><p style={{ fontSize: 15 }}>{example.text}</p>{example.pin && <small style={{ color: 'var(--accent)' }}>{example.pin}</small>}<small>{example.ru}</small></div>) : <small>{lookup.failed ? 'Словарь временно не ответил.' : 'Примеров пока нет.'}</small>}{lookup.failed && <button className="text-link" onClick={retryLookup}>Попробовать снова</button>}</Block>
      {lookup.phrasal.length > 0 && <Block title="Меняют смысл">{lookup.phrasal.map(text => <Phrasal key={text} text={text} parent={word} />)}</Block>}
    </>}
  </div>
}
