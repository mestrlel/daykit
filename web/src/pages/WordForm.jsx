import { useRef, useState } from 'react'
import { api } from '../api.js'
import { useBackAction } from '../navigation.jsx'
import { Icon } from '../icons.jsx'

export function WordForm({ lists, word, onSaved, onCancel }) {
  const [f, setF] = useState(word || { text: '', translation: '', language: 'en',
    transcription: '', example: '', list_id: '' })
  const [dup, setDup] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })


  useBackAction(() => {
    const dirty = ['text', 'translation', 'transcription', 'example'].some(key => f[key] !== (word?.[key] || ''))
    if (!dirty || confirm('Закрыть без сохранения слова?')) onCancel()
  }, !!onCancel)

  const fill = async () => {
    setBusy(true); setErr('')
    try {
      const d = await api(`/words/lookup?text=${encodeURIComponent(f.text)}&language=${f.language}`)
      setF(v => v.text !== f.text || v.language !== f.language ? v : ({
        ...v,
        transcription: v.transcription || d.transcription,
        translation: v.translation || d.translations.slice(0, 3).join(', '),
      }))
      if (!d.transcription && !d.translations.length) setErr('ничего не нашлось — впиши руками')
    } catch {
      setErr('словарь не ответил, попробуй ещё раз')
    }
    setBusy(false)
  }

  const save = async (force) => {
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    setErr(''); setDup(null)
    const body = { ...f, list_id: Number(f.list_id) || null, force_merge: force }
    try {
      onSaved(word ? await api(`/words/${word.id}`, body, 'PATCH') : await api('/words', body))
      if (!word) setF({ ...f, text: '', translation: '', transcription: '', example: '' })
    } catch (e) {
      if (e.status === 409) setDup(e.detail.existing)
      else setErr(typeof e.detail === 'string' ? e.detail : e.detail?.message || 'Не удалось сохранить слово')
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  return (
    <div className="card grid word-form fade">
      <div className="row">
        <input aria-label="Слово" placeholder="слово" value={f.text} onChange={set('text')} />
        <select value={f.language} onChange={set('language')} style={{ width: 86 }}>
          <option value="en">EN</option><option value="zh">中文</option>
        </select>
        <button className="btn" disabled={!f.text.trim() || busy} aria-label="заполнить из словаря"
                style={{ padding: 13, flex: '0 0 auto' }} onClick={fill}>
          <Icon name={busy ? 'timer' : 'search'} size={20} stroke="#fff" width={2.2} />
        </button>
      </div>
      <input aria-label="Перевод" placeholder="перевод" value={f.translation} onChange={set('translation')} />
      <div className="row">
        <input placeholder={f.language === 'zh' ? 'пиньинь' : 'транскрипция'}
               value={f.transcription} onChange={set('transcription')} />
        <select value={f.list_id || ''} onChange={set('list_id')}>
          <option value="">без списка</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <input placeholder="пример предложения" value={f.example} onChange={set('example')} />

      {dup && (
        <div className="grid" style={{
          background: 'var(--focus-soft)', borderRadius: 16, padding: 14, gap: 10,
        }}>
          <div>
            <b>Такое слово уже есть</b>
            <div className="muted">{dup.text} — {dup.translation}</div>
          </div>
          {!word && <button className="btn wide" disabled={saving} style={{ background: 'var(--focus)', boxShadow: '0 4px 0 var(--focus-lip)' }}
                  onClick={() => save(true)}>Объединить с существующим</button>
          }
        </div>
      )}
      {err && <small style={{ color: 'var(--danger)', fontWeight: 700 }}>{err}</small>}
      <div className="row">
        <button className="btn wide" disabled={saving || !f.text.trim() || !f.translation.trim()} onClick={() => save(false)}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Отмена</button>}
      </div>
    </div>
  )
}

