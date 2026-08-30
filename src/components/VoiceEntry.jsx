import { useMemo, useState } from "react";
import { Check, LoaderCircle, Mic, MicOff, Sparkles, X } from "lucide-react";
import AccessibleModal from "./AccessibleModal.jsx";

const relationPatterns = [
  [/father(?:'s)? older brother|father(?:'s)? brother|uncle|hermano (?:mayor )?de mi padre/i, "brother", "father"],
  [/mother(?:'s)? (?:older |younger )?brother|maternal uncle/i, "brother", "mother"],
  [/father(?:'s)? sister|aunt/i, "sister", "father"],
  [/mother(?:'s)? sister|maternal aunt/i, "sister", "mother"],
  [/\bmother\b/i, "mother", "self"],
  [/\bfather\b/i, "father", "self"],
  [/\bbrother\b/i, "brother", "self"],
  [/\bsister\b/i, "sister", "self"],
  [/\bson\b/i, "son", "self"],
  [/\bdaughter\b/i, "daughter", "self"],
];

export const parseFamilyStatement = (text) => {
  const cleaned = text.trim();
  const called = cleaned.match(/(?:called|named|was called|se llamaba|se llama|नाम था|نالو)\s+([\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){0,2})/iu);
  const lived = cleaned.match(/(?:lived|lives|moved)\s+(?:in|to)\s+([\p{L} .'-]+?)(?:[,.]|$|\s+and\s+)|(?:vivía|vive|se mudó)\s+(?:en|a)\s+([\p{L} .'-]+?)(?:[,.]|$|\s+y\s+)/iu);
  const born = cleaned.match(/born\s+in\s+([\p{L} .'-]+?)(?:[,.]|$|\s+and\s+)|(?:nació|nacido|nacida)\s+en\s+([\p{L} .'-]+?)(?:[,.]|$|\s+y\s+)/iu);
  const year = cleaned.match(/(?:born\s+(?:in\s+)?|naci[oó]\s+en\s+)(18\d{2}|19\d{2}|20\d{2})/i);
  const pattern = relationPatterns.find(([regex]) => regex.test(cleaned));
  const name = called?.[1]?.trim() || "";
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    statement: cleaned,
    relation: pattern?.[1] || "",
    anchorHint: pattern?.[2] || "self",
    firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "",
    surname: parts.length > 1 ? parts.at(-1) : "",
    birthYear: year?.[1] || "",
    birthPlaceText: (born?.[1] || born?.[2] || "").trim(),
    livedInText: (lived?.[1] || lived?.[2] || "").trim(),
  };
};

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
      <p>Example: “My father’s older brother was called Kishore Advani and he lived in Pune.” Vansh extracts a draft first; nothing is saved until you confirm it in the normal person form. English has the broadest parser coverage; Hindi, Spanish and Sindhi speech input are enabled incrementally.</p>
      <label className="auth-label">Speech language
        <select value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="en-US">English</option>
          <option value="hi-IN">Hindi</option>
          <option value="es-ES">Spanish</option>
          <option value="sd-IN">Sindhi</option>
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
