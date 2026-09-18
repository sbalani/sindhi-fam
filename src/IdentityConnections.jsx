import { useMemo, useState } from 'react'
import {
  Bell, Check, ChevronRight, CircleHelp, Fingerprint, GitFork, HeartHandshake,
  LoaderCircle, LockKeyhole, Search, ShieldCheck, UserCheck,
  UserRound, UsersRound, X,
} from 'lucide-react'

const shortCode = (value) => value ? `VNSH-${String(value).replaceAll('-', '').slice(0, 10).toUpperCase()}` : 'Generated automatically'

export function VerificationDrawer({ open, close, inbox, onOpenConnections }) {
  if (!open) return null
  const pending = inbox.filter(item => item.status === 'pending' && item.direction === 'incoming')
  const recent = inbox.filter(item => !(item.status === 'pending' && item.direction === 'incoming')).slice(0, 5)
  return <>
    <button className="verification-drawer-scrim" onClick={close} aria-label="Close verification requests" />
    <aside className="verification-drawer">
      <div className="verification-drawer-head">
        <div><span className="mini-title">VERIFICATIONS</span><h2>Family requests</h2></div>
        <button className="icon-button" onClick={close}><X size={18}/></button>
      </div>
      <div className="verification-drawer-body">
        {pending.length ? pending.map(item => <div className="verification-mini-card" key={`${item.kind}:${item.request_id}`}>
          <div className="verification-mini-icon"><UserCheck size={17}/></div>
          <div>
            <strong>{item.kind === 'identity' ? `${item.counterpart_name} wants to verify ${item.subject_name}` : `${item.counterpart_name} may be related to you`}</strong>
            <span>Needs your confirmation</span>
          </div>
        </div>) : <div className="verification-empty"><Bell size={22}/><strong>No requests waiting</strong><span>Mutual verification requests will appear here.</span></div>}
        {!!recent.length && <div className="verification-recent"><span className="mini-title">RECENT</span>{recent.map(item => <div key={`${item.kind}:${item.request_id}`}><strong>{item.counterpart_name}</strong><span>{item.status === 'accepted' ? 'Mutually verified' : item.status === 'rejected' ? 'Not verified' : 'Waiting for response'}</span></div>)}</div>}
      </div>
      <button className="primary full-button" onClick={() => { close(); onOpenConnections() }}>Open Connections <ChevronRight size={16}/></button>
    </aside>
  </>
}

export function IdentitySuggestionModal({ candidate, busy, onAccept, onDismiss, onClose }) {
  if (!candidate) return null
  return <div className="modal-wrap">
    <button className="modal-scrim" onClick={onClose}/>
    <section className="review-modal identity-prompt-modal">
      <button className="modal-close" onClick={onClose}><X/></button>
      <span className="mini-title"><Fingerprint size={14}/> POSSIBLE EXISTING RECORD</span>
      <div className="identity-prompt-icon"><UserRound/></div>
      <h2>Could this already be you?</h2>
      <p>Vansh found a person in another private family tree with several details matching your profile.</p>
      <div className="identity-candidate-summary">
        <strong>{candidate.display_name}</strong>
        <span>{candidate.person_code}</span>
        <div>{candidate.shared_details?.map(detail => <i key={detail}><Check size={12}/>{detail}</i>)}</div>
      </div>
      <div className="identity-safety-note"><ShieldCheck size={17}/><span><strong>No automatic linking.</strong> If you say this may be you, the person who created that family record must also approve it.</span></div>
      <button className="primary full-button" disabled={busy} onClick={onAccept}>{busy ? <LoaderCircle className="spin" size={16}/> : <UserCheck size={16}/>} Yes, this may be me</button>
      <button className="quiet full-button" disabled={busy} onClick={onDismiss}>Not me</button>
    </section>
  </div>
}

export function MemberIdentitySuggestionModal({ suggestion, busy, onAccept, onDismiss, onClose }) {
  if (!suggestion?.member || !suggestion?.candidate) return null
  const { member, candidate } = suggestion
  return <div className="modal-wrap">
    <button className="modal-scrim" onClick={onClose} aria-label="Close possible account match"/>
    <section className="review-modal identity-prompt-modal member-identity-prompt">
      <button className="modal-close" onClick={onClose}><X/></button>
      <span className="mini-title"><UserCheck size={14}/> POSSIBLE VANSH ACCOUNT</span>
      <div className="identity-prompt-icon"><Fingerprint/></div>
      <h2>Could {member.name} already be on Vansh?</h2>
      <p>A registered account matches several details you entered for this family member.</p>
      <div className="identity-match-pair">
        <div><span>Your family record</span><strong>{member.name}</strong>{member.birthDate ? <small>Born {member.birthDate}</small> : member.birthYear ? <small>Born {member.birthYear}</small> : null}</div>
        <div className="identity-match-arrow"><GitFork size={18}/></div>
        <div><span>Possible account</span><strong>{candidate.display_name}</strong><small>{candidate.score}% private match</small></div>
      </div>
      <div className="identity-candidate-summary compact">
        <div>{candidate.shared_details?.map(detail => <i key={detail}><Check size={12}/>{detail}</i>)}</div>
      </div>
      <div className="identity-safety-note"><ShieldCheck size={17}/><span><strong>This does not merge the trees.</strong> Sending this request only asks the registered person to confirm that this family record is them. The identity link is verified only after they accept.</span></div>
      <button className="primary full-button" disabled={busy} onClick={onAccept}>{busy ? <LoaderCircle className="spin" size={16}/> : <UserCheck size={16}/>} Ask them to verify</button>
      <button className="quiet full-button" disabled={busy} onClick={onDismiss}>Not the same person</button>
    </section>
  </div>
}

function StatusPill({ status, direction }) {
  const text = status === 'accepted' ? 'Mutually verified' : status === 'rejected' ? 'Not verified' : direction === 'incoming' ? 'Your approval needed' : 'Waiting for them'
  return <span className={`verification-status ${status} ${direction}`}>{text}</span>
}

export default function IdentityConnections({
  profile, self, matches, identityCandidates, surnameCandidates, inbox,
  loading, error, onSaveProfile, onClaimIdentity, onDismissIdentity,
  onRequestSurname, onDismissSurname, onRespond, onLegacyConnect,
}) {
  const [form, setForm] = useState(() => ({
    firstName: profile?.first_name || self?.firstName || '',
    surname: profile?.surname || self?.surname || '',
    birthDate: profile?.birth_date || self?.birthDate || '',
    birthLocation: profile?.birth_location_text || self?.birthPlace || '',
    currentLocation: profile?.current_location_text || self?.livedIn || profile?.location || '',
    discoveryEnabled: Boolean(profile?.discovery_enabled),
  }))
  const [savingProfile, setSavingProfile] = useState(false)
  const [actionKey, setActionKey] = useState('')
  const [message, setMessage] = useState('')


  const pendingIncoming = useMemo(() => inbox.filter(item => item.status === 'pending' && item.direction === 'incoming'), [inbox])
  const resolved = useMemo(() => inbox.filter(item => item.status !== 'pending'), [inbox])

  const run = async (key, fn) => {
    setActionKey(key); setMessage('')
    try { await fn() } catch (e) { setMessage(e.message || 'Could not complete that action.') } finally { setActionKey('') }
  }

  const saveProfile = async (event) => {
    event.preventDefault(); setSavingProfile(true); setMessage('')
    try { await onSaveProfile(form); setMessage('Matching profile updated.') }
    catch (e) { setMessage(e.message || 'Could not update your profile.') }
    finally { setSavingProfile(false) }
  }

  return <div className="page inner-page connections-hub">
    <div className="section-heading"><div><span className="eyebrow">MUTUAL FAMILY VERIFICATION</span><h1>Connections</h1><p>Vansh can suggest overlaps, but no person or family connection is verified until both sides agree.</p></div></div>

    <div className="privacy-banner"><LockKeyhole size={22}/><div><strong>Matching without silent merging</strong><p>Your Vansh ID is random; it does not contain your name, date of birth or location. Personal details are used only inside protected matching functions.</p></div></div>

    <section className="panel matching-profile-panel">
      <div className="panel-title"><div><span className="mini-title">YOUR MATCHING PROFILE</span><h2>Help Vansh distinguish you from someone with the same surname</h2><p>Birth date and places make identity suggestions much safer than surname-only matching.</p></div><span className="identity-code"><Fingerprint size={14}/>{shortCode(self?.personIdentityId)}</span></div>
      <form className="matching-profile-grid" onSubmit={saveProfile}>
        <label>First name<input required value={form.firstName} onChange={e => setForm({...form, firstName:e.target.value})}/></label>
        <label>Family surname<input required value={form.surname} onChange={e => setForm({...form, surname:e.target.value})}/></label>
        <label>Date of birth<input required type="date" value={form.birthDate} onChange={e => setForm({...form, birthDate:e.target.value})}/></label>
        <label>Birth place <small>City or country</small><input value={form.birthLocation} onChange={e => setForm({...form, birthLocation:e.target.value})} placeholder="e.g. Mumbai, India"/></label>
        <label className="wide">Current / last known location <small>City or country</small><input value={form.currentLocation} onChange={e => setForm({...form, currentLocation:e.target.value})} placeholder="e.g. Barcelona, Spain"/></label>
        <label className="discovery-opt-in wide"><input type="checkbox" checked={form.discoveryEnabled} onChange={e => setForm({...form, discoveryEnabled:e.target.checked})}/><span><strong>Allow same-surname discovery</strong><small>Other signed-in Vansh users with the same surname see only a masked name and limited matching clues before you connect. Never your email, exact birth date, precise location or family tree.</small></span></label>
        <div className="wide matching-profile-actions"><button className="primary" disabled={savingProfile}>{savingProfile ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} Save matching details</button></div>
      </form>
    </section>

    {message && <div className="auth-message success"><CircleHelp size={15}/>{message}</div>}
    {error && <div className="auth-message"><CircleHelp size={15}/>{error}</div>}

    <section className="connections-section">
      <div className="panel-title"><div><span className="mini-title">IDENTITY CHECK</span><h2>Could one of these records already be you?</h2><p>These require a strong match on your own profile data, not just a shared surname.</p></div></div>
      {loading ? <div className="panel empty"><LoaderCircle className="spin"/><p>Checking private overlaps…</p></div> : identityCandidates.length ? <div className="connection-grid identity-grid">{identityCandidates.map(candidate => <article className="connection-card identity-card" key={candidate.candidate_member_id}>
        <div className="score-ring"><strong>{candidate.score}%</strong><span>match</span></div>
        <div className="identity-card-icon"><Fingerprint/></div>
        <h2>{candidate.display_name}</h2><span className="identity-code">{candidate.person_code}</span>
        <p>{[candidate.birth_year && `Born ${candidate.birth_year}`, candidate.birth_place, candidate.lived_in].filter(Boolean).join(' · ') || 'Limited clues available'}</p>
        <div className="why"><strong>Matching clues</strong>{candidate.shared_details?.map(item => <span key={item}><Check size={13}/>{item}</span>)}</div>
        <button className="primary" disabled={!!actionKey} onClick={() => run(`claim:${candidate.candidate_member_id}`, () => onClaimIdentity(candidate))}>{actionKey === `claim:${candidate.candidate_member_id}` ? <LoaderCircle className="spin" size={15}/> : <UserCheck size={15}/>} This may be me</button>
        <button className="quiet" disabled={!!actionKey} onClick={() => run(`dismiss-id:${candidate.candidate_member_id}`, () => onDismissIdentity(candidate))}>Not me</button>
      </article>)}</div> : <div className="panel empty"><UserCheck size={25}/><h3>No strong identity overlaps</h3><p>That is normal. Vansh only surfaces these when several details line up.</p></div>}
    </section>

    <section className="connections-section">
      <div className="panel-title"><div><span className="mini-title">SURNAME DISCOVERY</span><h2>People with the same surname</h2><p>A shared surname is only a lead. Saying “I may know them” sends a request; it does not create a family relationship.</p></div></div>
      {surnameCandidates.length ? <div className="connection-grid surname-grid">{surnameCandidates.map(candidate => <article className="connection-card" key={candidate.candidate_code}>
        <div className="surname-avatar"><UsersRound/></div><h2>{candidate.display_name}</h2><p>{[candidate.birth_year && `Born ${candidate.birth_year}`, candidate.current_location, candidate.birth_location && `born in ${candidate.birth_location}`].filter(Boolean).join(' · ') || `Surname: ${candidate.surname}`}</p>
        <span className="relation-label"><GitFork size={15}/> Same surname</span>
        <button className="primary" disabled={!!actionKey} onClick={() => run(`surname:${candidate.candidate_code}`, () => onRequestSurname(candidate))}>{actionKey === `surname:${candidate.candidate_code}` ? <LoaderCircle className="spin" size={15}/> : <HeartHandshake size={15}/>} I may be related</button>
        <button className="quiet" disabled={!!actionKey} onClick={() => run(`dismiss-surname:${candidate.candidate_code}`, () => onDismissSurname(candidate))}>I don't know them</button>
      </article>)}</div> : <div className="panel empty"><Search size={25}/><h3>No surname suggestions right now</h3><p>Only people who explicitly enable surname discovery can appear here.</p></div>}
    </section>

    <section className="connections-section">
      <div className="panel-title"><div><span className="mini-title">MUTUAL APPROVAL</span><h2>Requests needing verification</h2><p>Incoming requests do nothing until you approve them.</p></div>{pendingIncoming.length ? <span className="request-count">{pendingIncoming.length} waiting</span> : null}</div>
      {inbox.length ? <div className="verification-list">{inbox.map(item => <article className="verification-row" key={`${item.kind}:${item.request_id}`}>
        <div className="verification-row-icon">{item.kind === 'identity' ? <Fingerprint/> : <HeartHandshake/>}</div>
        <div className="verification-row-main"><div><strong>{item.kind === 'identity' ? (item.direction === 'incoming' ? `${item.counterpart_name} wants to verify ${item.subject_name}` : `Identity check for ${item.subject_name}`) : `${item.counterpart_name} may be a family connection`}</strong><StatusPill status={item.status} direction={item.direction}/></div>
        <p>{item.kind === 'identity' ? (item.shared_details?.join(' · ') || 'Identity details matched privately.') : 'Same-surname discovery. No exact relationship has been created.'}</p></div>
        {item.status === 'pending' && item.direction === 'incoming' ? <div className="verification-row-actions"><button className="secondary" disabled={!!actionKey} onClick={() => run(`reject:${item.kind}:${item.request_id}`, () => onRespond(item, false))}><X size={14}/> No</button><button className="primary" disabled={!!actionKey} onClick={() => run(`accept:${item.kind}:${item.request_id}`, () => onRespond(item, true))}><Check size={14}/> Confirm</button></div> : null}
      </article>)}</div> : <div className="panel empty"><ShieldCheck size={25}/><h3>No verification requests yet</h3><p>When another user claims an identity or a possible family connection, it will appear here and in the bell menu.</p></div>}
    </section>

    {!!resolved.length && <div className="identity-safety-note"><ShieldCheck size={17}/><span><strong>Verification means “both users agree”.</strong> It still does not invent an exact parent/sibling/cousin relationship. That relationship must be added separately when known.</span></div>}

    {!!matches.length && <section className="connections-section"><div className="panel-title"><div><span className="mini-title">GRAPH CLUES</span><h2>Other possible family overlaps</h2><p>Older Vansh matching suggestions remain separate from verified identity claims.</p></div></div><div className="connection-grid">{matches.map(match => <article className="connection-card" key={match.id}><div className="score-ring"><strong>{match.score}%</strong><span>confidence</span></div><h2>{match.name}</h2><p>{match.details}</p><div className="why">{match.shared.map(item => <span key={item}><Check size={13}/>{item}</span>)}</div><button className="primary" onClick={() => onLegacyConnect(match, 'requested')}><HeartHandshake size={15}/> Send request</button></article>)}</div></section>}
  </div>
}
