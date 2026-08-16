import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleHelp,
  FileAudio, Languages, LoaderCircle, Mic, Network, Play, RotateCcw,
  Sparkles, Square, Upload, UserRound, WandSparkles, XCircle,
} from 'lucide-react'
import { draftPersonName, interpretFamilyStory, overrideDraftRelation, relationChoiceForPerson, VOICE_LANGUAGES, VOICE_RELATION_CHOICES } from './familyInterpreter.js'

const TEXT = {
  en: {
    eyebrow: 'VOICE FAMILY IMPORT', title: 'Tell Vansh your family story',
    subtitle: 'Speak naturally. Vansh creates a rough interpretation first; you confirm each person before anything enters the real tree.',
    language: 'Language', narrator: 'Who is speaking?', start: 'Start recording', stop: 'Stop recording', upload: 'Upload audio',
    transcript: 'Transcript', transcriptHelp: 'Correct anything speech recognition misheard before Vansh interprets the relationships.',
    transcribe: 'Transcribe recorded audio', interpret: 'Interpret my family story', sample: 'Load sample story',
    rough: 'Rough family tree', roughText: 'This is only an interpretation. Dashed connections are not saved yet.', review: 'Review interpretation',
    high: 'High confidence', medium: 'Needs checking', low: 'Low confidence', back: 'Back to transcript',
    reviewTitle: 'Check each person and relationship', relation: 'Relationship to narrator', relationHelp: 'Change this if Vansh interpreted the relationship incorrectly.', name: 'Name', age: 'Age', location: 'Current / last known location', birth: 'Birth location', evidence: 'Why Vansh mapped this',
    confirm: 'Confirm', reject: 'Reject mapping', unknown: 'Keep as unknown relative', summary: 'Review complete',
    summaryText: 'Only confirmed people and connections will be added to the real family tree.', add: 'Add confirmed people to family tree',
    done: 'Family story added', doneText: 'The confirmed interpretation is now part of your Vansh family map.', open: 'Open family map', another: 'Interpret another story',
    safe: 'Nothing is saved until you confirm it.', service: 'For recorded audio, start the included local Whisper service. Chrome live transcription can work without it.',
  },
  es: {
    eyebrow: 'IMPORTACIÓN POR VOZ', title: 'Cuéntale a Vansh la historia de tu familia',
    subtitle: 'Habla con naturalidad. Vansh crea una interpretación provisional y tú confirmas cada persona antes de guardar nada.',
    language: 'Idioma', narrator: '¿Quién está hablando?', start: 'Empezar a grabar', stop: 'Parar grabación', upload: 'Subir audio',
    transcript: 'Transcripción', transcriptHelp: 'Corrige los errores del reconocimiento antes de interpretar las relaciones.',
    transcribe: 'Transcribir audio grabado', interpret: 'Interpretar mi historia familiar', sample: 'Cargar ejemplo',
    rough: 'Árbol familiar aproximado', roughText: 'Es solo una interpretación. Las conexiones discontinuas aún no se han guardado.', review: 'Revisar interpretación',
    high: 'Confianza alta', medium: 'Hay que comprobar', low: 'Confianza baja', back: 'Volver a la transcripción',
    reviewTitle: 'Comprueba cada persona y relación', relation: 'Relación con quien habla', relationHelp: 'Cámbiala si Vansh interpretó mal la relación.', name: 'Nombre', age: 'Edad', location: 'Ubicación actual / última conocida', birth: 'Lugar de nacimiento', evidence: 'Por qué Vansh hizo esta conexión',
    confirm: 'Confirmar', reject: 'Rechazar relación', unknown: 'Mantener como familiar desconocido', summary: 'Revisión completada',
    summaryText: 'Solo se añadirán las personas y conexiones confirmadas.', add: 'Añadir confirmados al árbol',
    done: 'Historia familiar añadida', doneText: 'La interpretación confirmada ya forma parte del mapa familiar.', open: 'Abrir mapa familiar', another: 'Interpretar otra historia',
    safe: 'No se guarda nada hasta que lo confirmes.', service: 'Para audio grabado, inicia el servicio local Whisper incluido. La transcripción en vivo de Chrome puede funcionar sin él.',
  },
  sd: {
    eyebrow: 'آواز سان خانداني معلومات', title: 'Vansh کي پنهنجي خاندان جي ڪهاڻي ٻڌايو',
    subtitle: 'قدرتي نموني ڳالهايو. Vansh پهرين اندازي وارو نقشو ٺاهيندو ۽ اصل وڻ ۾ شامل ڪرڻ کان اڳ توهان تصديق ڪندا.',
    language: 'ٻولي', narrator: 'ڪير ڳالهائي رهيو آهي؟', start: 'رڪارڊنگ شروع ڪريو', stop: 'رڪارڊنگ بند ڪريو', upload: 'آڊيو اپلوڊ ڪريو',
    transcript: 'لکيل متن', transcriptHelp: 'خانداني لاڳاپا سمجهڻ کان اڳ متن جون غلطيون درست ڪريو.',
    transcribe: 'رڪارڊ ڪيل آڊيو لکو', interpret: 'خانداني ڪهاڻي سمجهو', sample: 'مثالي ڪهاڻي',
    rough: 'اندازي وارو خانداني وڻ', roughText: 'هي رڳو تشريح آهي. ٽٽل لائينون اڃا محفوظ ناهن.', review: 'تشريح چيڪ ڪريو',
    high: 'وڏي اعتماد سان', medium: 'چيڪ ڪرڻ ضروري', low: 'گهٽ اعتماد', back: 'متن ڏانهن واپس',
    reviewTitle: 'هر شخص ۽ لاڳاپو چيڪ ڪريو', relation: 'ڳالهائيندڙ سان لاڳاپو', relationHelp: 'جيڪڏهن Vansh لاڳاپو غلط سمجهيو آهي ته هتي درست ڪريو.', name: 'نالو', age: 'عمر', location: 'هاڻوڪي / آخري ڄاڻايل جاءِ', birth: 'ڄمڻ جي جاءِ', evidence: 'Vansh هي لاڳاپو ڇو ٺاهيو',
    confirm: 'تصديق ڪريو', reject: 'هن نقشبندي کي رد ڪريو', unknown: 'اڻڄاتل مائٽ طور رکو', summary: 'چڪاس مڪمل',
    summaryText: 'صرف تصديق ٿيل ماڻهو ۽ لاڳاپا اصل وڻ ۾ شامل ٿيندا.', add: 'تصديق ٿيل ماڻهو وڻ ۾ شامل ڪريو',
    done: 'خانداني ڪهاڻي شامل ٿي وئي', doneText: 'تصديق ٿيل تشريح هاڻي Vansh جي خانداني نقشي جو حصو آهي.', open: 'خانداني نقشو کوليو', another: 'ٻي ڪهاڻي شامل ڪريو',
    safe: 'تصديق کان اڳ ڪجھ به محفوظ نه ٿيندو.', service: 'رڪارڊ ٿيل آڊيو لاءِ شامل ڪيل مقامي Whisper سروس هلائيو.',
  },
}

const SAMPLES = {
  en: "My father is Rajesh Nanwani, he is 55 and lives in Barcelona. His mother was Kamla. My mother is Anita Nanwani, she is 52 and was born in Mumbai. My mother's brother is Vijay Nanwani.",
  es: 'Mi padre se llama Carlos Nanwani y tiene 55 años y vive en Madrid. Mi madre se llama Anita Nanwani y tiene 52 años. El hermano de mi madre se llama Vijay Nanwani.',
  sd: 'منهنجو بابا Rajesh Nanwani آهي. منهنجي اما Anita Nanwani آهي. منهنجو ڀاءُ Rohit Nanwani آهي.',
}
const VOICE_API = import.meta.env.VITE_VOICE_API_URL || 'http://127.0.0.1:8001'

const confidenceText = (copy, band) => band === 'high' ? copy.high : band === 'medium' ? copy.medium : copy.low

function RoughTree({ draft, copy, onSelect }) {
  const people = draft.people.filter(p => p.status !== 'rejected')
  const ids = new Set(people.map(p => p.tempId))
  const links = draft.relationships.filter(r => r.status !== 'rejected' && ids.has(r.from) && ids.has(r.to))
  const levels = { [draft.narratorTempId]: 0 }
  for (let pass = 0; pass < people.length + 2; pass += 1) links.forEach(r => {
    const a = levels[r.from], b = levels[r.to]
    if (r.type === 'parent') {
      if (a !== undefined && b === undefined) levels[r.to] = a + 1
      if (b !== undefined && a === undefined) levels[r.from] = b - 1
    } else {
      if (a !== undefined && b === undefined) levels[r.to] = a
      if (b !== undefined && a === undefined) levels[r.from] = b
    }
  })
  people.forEach(p => { levels[p.tempId] ??= 0 })
  const groups = people.reduce((acc, p) => { (acc[levels[p.tempId]] ||= []).push(p); return acc }, {})
  const numbers = Object.keys(groups).map(Number).sort((a, b) => a - b)
  const min = Math.min(...numbers, 0), max = Math.max(...numbers, 0)
  const pos = {}
  numbers.forEach(level => groups[level].forEach((p, i) => {
    pos[p.tempId] = [((i + 1) / (groups[level].length + 1)) * 100, max === min ? 50 : 14 + ((level - min) / (max - min)) * 72]
  }))
  return <div className="voice-rough-map">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {links.map(r => pos[r.from] && pos[r.to] ? <line key={r.id} x1={pos[r.from][0]} y1={pos[r.from][1]} x2={pos[r.to][0]} y2={pos[r.to][1]} className={r.variant ? `${r.type} ${r.variant}` : r.type} /> : null)}
    </svg>
    {people.map(p => pos[p.tempId] ? <button type="button" key={p.tempId}
      className={`voice-draft-node ${p.confidenceBand} ${p.status} ${p.isNarrator ? 'narrator' : ''}`}
      style={{ left: `${pos[p.tempId][0]}%`, top: `${pos[p.tempId][1]}%` }}
      onClick={() => !p.isNarrator && onSelect?.(p.tempId)}>
      <strong>{draftPersonName(p)}</strong><span>{p.relationToNarrator}</span>
      {(p.age || p.location) && <small>{[p.age, p.location].filter(Boolean).join(' · ')}</small>}
      {!p.isNarrator && <i>{confidenceText(copy, p.confidenceBand)}</i>}
    </button> : null)}
  </div>
}

export default function VoiceFamilyImport({ people, relationships, onCommit, onOpenTree }) {
  const [language, setLanguage] = useState('en')
  const copy = TEXT[language]
  const [narratorId, setNarratorId] = useState(people.find(p => p.isSelf)?.id || people[0]?.id || '')
  const [step, setStep] = useState('capture')
  const [transcript, setTranscript] = useState('')
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [draft, setDraft] = useState(null)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const recorderRef = useRef(null), streamRef = useRef(null), recognitionRef = useRef(null), fileRef = useRef(null)
  const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
  const narrator = people.find(p => p.id === narratorId) || people[0]

  const applyAudioBlob = blob => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(blob); setAudioUrl(blob ? URL.createObjectURL(blob) : '')
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream
      const recorder = new MediaRecorder(stream); recorderRef.current = recorder; const chunks = []
      recorder.ondataavailable = e => e.data?.size && chunks.push(e.data)
      recorder.onstop = () => applyAudioBlob(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      recorder.start(); setRecording(true); setTranscript('')
      if (SpeechRecognition) {
        const rec = new SpeechRecognition(); recognitionRef.current = rec; rec.lang = VOICE_LANGUAGES[language].locale; rec.continuous = true; rec.interimResults = true
        let final = ''
        rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i += 1) { const t = e.results[i][0]?.transcript || ''; if (e.results[i].isFinal) final += `${t} `; else interim += t } setTranscript(`${final}${interim}`.trim()) }
        rec.onerror = () => {}; try { rec.start() } catch { /* recording still works */ }
      }
    } catch (e) { setError(e.message || 'Could not access the microphone.') }
  }
  const stopRecording = () => {
    setRecording(false); recognitionRef.current?.stop?.(); recognitionRef.current = null
    if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
  }
  const transcribe = async () => {
    if (!audioBlob) return; setBusy(true); setError('')
    try {
      const form = new FormData(); form.append('file', audioBlob, audioBlob.name || `family-story-${Date.now()}.webm`); form.append('language', language)
      const response = await fetch(`${VOICE_API}/transcribe`, { method: 'POST', body: form }); const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || 'Transcription failed.'); setTranscript(data.text || '')
    } catch (e) { setError(`${e.message} Start voice_backend/2 - START VOICE BACKEND.bat, or edit the transcript manually.`) } finally { setBusy(false) }
  }
  const interpret = () => {
    if (!transcript.trim() || !narrator) return
    const result = interpretFamilyStory({ transcript, language, narrator, people, relationships }); setDraft(result); setReviewIndex(0); setStep('preview')
  }
  const reviewPeople = useMemo(() => draft?.people.filter(p => !p.isNarrator) || [], [draft])
  const current = reviewPeople[reviewIndex], reviewDone = Boolean(draft) && reviewIndex >= reviewPeople.length
  const patchPerson = patch => setDraft(d => ({ ...d, people: d.people.map(p => p.tempId === current.tempId ? { ...p, ...patch } : p) }))
  const decide = status => {
    setDraft(d => ({ ...d, people: d.people.map(p => p.tempId === current.tempId ? { ...p, status } : p), relationships: d.relationships.map(r => r.from === current.tempId || r.to === current.tempId ? { ...r, status: status === 'rejected' ? 'rejected' : 'confirmed' } : r) }))
    setReviewIndex(i => i + 1)
  }
  const selectNode = id => { const i = reviewPeople.findIndex(p => p.tempId === id); if (i >= 0) { setReviewIndex(i); setStep('review') } }
  const commit = async () => { setBusy(true); setError(''); try { await onCommit(draft); setStep('done') } catch (e) { setError(e.message || 'Could not save the confirmed interpretation.') } finally { setBusy(false) } }
  const reset = () => { setStep('capture'); setTranscript(''); setDraft(null); setReviewIndex(0); setError(''); applyAudioBlob(null) }

  return <div className="page inner-page voice-page" dir={language === 'sd' ? 'rtl' : 'ltr'}>
    {step === 'capture' && <>
      <div className="section-heading voice-heading"><div><span className="eyebrow">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div><div className="voice-safe"><Sparkles size={16}/>{copy.safe}</div></div>
      <div className="voice-grid">
        <section className="panel voice-record-panel">
          <div className="voice-config">
            <label><span><Languages size={14}/>{copy.language}</span><select value={language} onChange={e => setLanguage(e.target.value)}>{Object.entries(VOICE_LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label><span><UserRound size={14}/>{copy.narrator}</span><select value={narratorId} onChange={e => setNarratorId(e.target.value)}>{people.map(p => <option value={p.id} key={p.id}>{p.name}{p.isSelf ? ' (you)' : ''}</option>)}</select></label>
          </div>
          <div className={`voice-recorder ${recording ? 'recording' : ''}`}><div className="voice-mic">{recording ? <Square/> : <Mic/>}</div><div><strong>{recording ? copy.stop : copy.start}</strong><span>{VOICE_LANGUAGES[language].label}</span></div><button className={recording ? 'danger-button' : 'primary'} onClick={recording ? stopRecording : startRecording}>{recording ? <><Square size={14}/>{copy.stop}</> : <><Mic size={15}/>{copy.start}</>}</button></div>
          <div className="voice-audio-row"><input ref={fileRef} hidden type="file" accept="audio/*" onChange={e => e.target.files?.[0] && applyAudioBlob(e.target.files[0])}/><button className="secondary" onClick={() => fileRef.current?.click()}><Upload size={15}/>{copy.upload}</button>{audioUrl && <audio controls src={audioUrl}/>}</div>
          <p className="voice-service-note"><FileAudio size={14}/>{copy.service}</p>
          {audioBlob && <button className="voice-transcribe" onClick={transcribe} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <FileAudio size={15}/>} {copy.transcribe}</button>}
        </section>
        <section className="panel voice-transcript-panel"><div className="panel-title"><div><span className="mini-title">{copy.transcript}</span><h2>{copy.transcript}</h2><p>{copy.transcriptHelp}</p></div><button className="text-button" onClick={() => setTranscript(SAMPLES[language])}><Play size={13}/>{copy.sample}</button></div><textarea className="voice-transcript" value={transcript} onChange={e => setTranscript(e.target.value)} placeholder={language === 'es' ? 'Mi padre se llama Carlos…' : language === 'sd' ? 'منهنجو بابا Rajesh Nanwani آهي…' : 'My father is Rajesh…'}/><div className="voice-footer"><span>{transcript.trim().split(/\s+/).filter(Boolean).length} words</span><button className="primary" onClick={interpret} disabled={!transcript.trim()}><WandSparkles size={16}/>{copy.interpret}</button></div></section>
      </div>
    </>}

    {step === 'preview' && draft && <>
      <div className="section-heading voice-heading"><div><span className="eyebrow">VANSH UNDERSTOOD THIS</span><h1>{copy.rough}</h1><p>{copy.roughText}</p></div><div className="voice-legend"><span className="high">● {copy.high}</span><span className="medium">● {copy.medium}</span><span className="low">● {copy.low}</span></div></div>
      <section className="panel voice-preview"><div className="voice-preview-label"><Network size={16}/><strong>{copy.rough}</strong><span>{draft.people.length - 1} relatives</span></div><RoughTree draft={draft} copy={copy} onSelect={selectNode}/></section>
      {!!draft.warnings.length && <div className="voice-warnings"><AlertTriangle size={18}/><div>{draft.warnings.slice(0,4).map(w => <p key={w}>{w}</p>)}</div></div>}
      <div className="voice-actions"><button className="quiet" onClick={() => setStep('capture')}><ArrowLeft size={15}/>{copy.back}</button><button className="primary" disabled={!reviewPeople.length} onClick={() => { setReviewIndex(0); setStep('review') }}>{copy.review}<ArrowRight size={15}/></button></div>
    </>}

    {step === 'review' && draft && <>
      <div className="section-heading voice-heading"><div><span className="eyebrow">CONFIRM ONE BY ONE</span><h1>{copy.reviewTitle}</h1><p>{Math.min(reviewIndex + 1, reviewPeople.length)} / {reviewPeople.length}</p></div></div>
      {!reviewDone && current ? <section className="panel voice-review-card">
        <div className="voice-review-head"><div className={`voice-person-icon ${current.confidenceBand}`}><UserRound/></div><div><span>{confidenceText(copy, current.confidenceBand)}</span><h2>{draftPersonName(current)}</h2><p>{current.relationToNarrator}</p></div></div>
        <div className="voice-review-form">
          <label className="wide">{copy.relation}<select className="voice-relation-select" value={relationChoiceForPerson(current)} onChange={e => setDraft(d => overrideDraftRelation(d, current.tempId, e.target.value))}>{VOICE_RELATION_CHOICES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small className="voice-field-help">{copy.relationHelp}</small></label>
          <label>{copy.name}<input value={current.isPlaceholder ? '' : [current.firstName,current.surname].filter(Boolean).join(' ')} placeholder={current.placeholderLabel || 'Unknown relative'} onChange={e => { const parts=e.target.value.trim().split(/\s+/).filter(Boolean); patchPerson({ firstName: parts.length>1?parts.slice(0,-1).join(' '):(parts[0]||'Unknown'), surname: parts.length>1?parts.at(-1):(current.surname||narrator.surname||'Unknown'), isPlaceholder: !e.target.value.trim() }) }}/></label>
          <label>{copy.age}<input inputMode="numeric" value={current.age || ''} onChange={e => patchPerson({ age: e.target.value ? Number(e.target.value) : null })}/></label>
          <label>{copy.location}<input value={current.location || ''} onChange={e => patchPerson({ location: e.target.value })}/></label>
          <label>{copy.birth}<input value={current.birthLocation || ''} onChange={e => patchPerson({ birthLocation: e.target.value })}/></label>
        </div>
        <div className="voice-evidence"><CircleHelp size={16}/><div><strong>{copy.evidence}</strong><p>“{current.evidence}”</p></div></div>
        <div className="voice-review-actions"><button className="reject-button" onClick={() => decide('rejected')}><XCircle size={16}/>{copy.reject}</button><button className="primary" onClick={() => decide('confirmed')}><Check size={16}/>{current.isPlaceholder ? copy.unknown : copy.confirm}</button></div>
      </section> : <section className="panel voice-summary"><CheckCircle2 size={34}/><h2>{copy.summary}</h2><p>{copy.summaryText}</p><div className="voice-summary-counts"><span><strong>{draft.people.filter(p => !p.isNarrator && p.status === 'confirmed').length}</strong> confirmed</span><span><strong>{draft.people.filter(p => p.status === 'rejected').length}</strong> rejected</span><span><strong>{draft.relationships.filter(r => r.status === 'confirmed').length}</strong> connections</span></div><RoughTree draft={draft} copy={copy}/><button className="primary voice-commit" onClick={commit} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <CheckCircle2 size={16}/>} {copy.add}</button></section>}
      <div className="voice-actions"><button className="quiet" onClick={() => setStep('preview')}><ArrowLeft size={15}/>{copy.rough}</button>{!reviewDone && reviewIndex > 0 && <button className="quiet" onClick={() => setReviewIndex(i => i - 1)}><ArrowLeft size={15}/>Previous</button>}</div>
    </>}

    {step === 'done' && <section className="panel voice-done"><div className="voice-done-icon"><CheckCircle2 size={40}/></div><h1>{copy.done}</h1><p>{copy.doneText}</p><div><button className="secondary" onClick={reset}><RotateCcw size={15}/>{copy.another}</button><button className="primary" onClick={onOpenTree}><Network size={16}/>{copy.open}</button></div></section>}

    {error && <div className="voice-error"><AlertTriangle size={17}/><span>{error}</span></div>}
  </div>
}
