import { useMemo, useState } from "react";
import { Check, LoaderCircle, Mic, MicOff, Sparkles, X } from "lucide-react";
import AccessibleModal from "./AccessibleModal.jsx";
import { parseFamilyStatement } from "../utils/voiceStatement.js";

export default function VoiceEntry({ close, onProposal }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [error, setError] = useState("");
  const proposal = useMemo(() => parseFamilyStatement(text), [text]);
  const start = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice recognition is not available in this browser. You can still type the statement below.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language || navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError("Voice recognition stopped before Vansh could understand the statement."); };
    recognition.onresult = (event) => setText(event.results[0][0].transcript);
    recognition.start();
  };
  return (
    <AccessibleModal close={close} className="add-modal voice-modal" label="Voice-assisted family entry">
      <button className="modal-close" onClick={close}><X /></button>
      <span className="mini-title"><Mic size={15} /> VOICE-ASSISTED ENTRY</span>
      <h2>Describe one relative</h2>
      <p>Example: “My father’s older brother was called Kishore Advani and he lived in Pune.” Vansh extracts a draft first; nothing is saved until you confirm it in the normal person form. English has the broadest parser coverage. Sindhi kinship terms and Roman-Sindhi variants are recognized, and every extracted fact still requires confirmation.</p>
      <label className="auth-label">Speech language
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en-US">English</option>
          <option value="hi-IN">Hindi</option>
          <option value="es-ES">Spanish</option>
          <option value="sd-PK">Sindhi (Pakistan)</option>
          <option value="sd-IN">Sindhi (India)</option>
        </select>
      </label>
      <div className="voice-capture">
        <button type="button" className={listening ? "primary listening" : "quiet"} onClick={start} disabled={listening}>
          {listening ? <><LoaderCircle className="spin" size={16} /> Listening…</> : <><Mic size={16} /> Start microphone</>}
        </button>
        {listening && <MicOff size={18} />}
      </div>
      <label className="auth-label">Statement<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder="Type or dictate a family fact…" /></label>
      {error && <div className="auth-message">{error}</div>}
      {text && (
        <div className="voice-proposal">
          <span className="mini-title"><Sparkles size={13} /> PROPOSED INTERPRETATION</span>
          <p><strong>Relationship:</strong> {proposal.relation || "Needs review"}</p>
          <p><strong>Name:</strong> {[proposal.firstName, proposal.surname].filter(Boolean).join(" ") || "Needs review"}</p>
          {proposal.birthYear && <p><strong>Birth year:</strong> {proposal.birthYear}</p>}
          {proposal.birthPlaceText && <p><strong>Birthplace clue:</strong> {proposal.birthPlaceText}</p>}
          {proposal.livedInText && <p><strong>Residence clue:</strong> {proposal.livedInText}</p>}
        </div>
      )}
      <div className="modal-actions">
        <button className="quiet" onClick={close}>Cancel</button>
        <button className="primary" disabled={!text.trim()} onClick={() => onProposal(proposal)}><Check size={16} /> Review before saving</button>
      </div>
    </AccessibleModal>
  );
}
