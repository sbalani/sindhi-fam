import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Check, CircleHelp, GitFork, MapPin, Pencil, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { relationSummary } from "../utils/kinship.js";
import { supabase } from "../supabase.js";

const statusText = (person) => {
  if (person.isPlaceholder) return "Needs identification";
  if (person.isIdentityOwner) return "Claimed by you";
  if (person.isClaimed) return "Claimed profile";
  if (person.confirmationCount > 0) return `Confirmed by ${person.confirmationCount} relative${person.confirmationCount === 1 ? "" : "s"}`;
  return "Unclaimed";
};

const aliasTypeLabel = (kind) => ({
  sindhi_script: "Sindhi-script name",
  roman: "Roman spelling",
  former: "Former / earlier name",
  historical: "Historical spelling",
  other: "Other name",
}[kind] || "Alternate name");

export default function PersonDetail({ person, people, relationships, branchLabel, back, edit, invite, openPerson }) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    let active = true;
    if (!person?.id) return undefined;
    supabase.rpc("get_member_change_history", { p_member_id: person.id }).then(({ data }) => {
      if (active) setHistory(data || []);
    });
    return () => { active = false; };
  }, [person?.id]);
  if (!person) return null;
  const relations = relationSummary(person.id, people, relationships);
  const relationGroup = (label, entries, renderLabel = (entry) => entry.name) => (
    <section className="detail-section">
      <h3>{label}</h3>
      {entries.length ? (
        <div className="detail-relations">
          {entries.map((entry) => {
            const target = entry.person || entry;
            return (
              <button key={target.id} onClick={() => openPerson(target)}>
                <span>{renderLabel(entry)}</span>
                {entry.kind && <small>{entry.kind} sibling</small>}
              </button>
            );
          })}
        </div>
      ) : <p className="muted">None recorded.</p>}
    </section>
  );

  return (
    <div className="page inner-page person-detail-page">
      <button className="text-button detail-back" onClick={back}><ArrowLeft size={16} /> Back</button>
      <div className="person-detail-hero">
        <div className={`avatar ${person.color || "teal"} large`}>{person.initials}</div>
        <div>
          <span className="eyebrow">PERSON PROFILE</span>
          <h1>{person.name}</h1>
          <div className={`detail-status ${person.isClaimed ? "claimed" : "unclaimed"}`}>{person.isClaimed ? <ShieldCheck size={15} /> : <CircleHelp size={15} />} {statusText(person)}</div>
          <p>{branchLabel}</p>
        </div>
        <div className="heading-actions">
          {!person.linkedUserId && !person.isSelf && <button className="quiet" onClick={() => invite(person)}><UserPlus size={16} /> Invite</button>}
          {(person.canEdit || person.canSuggest) && <button className="primary" onClick={() => edit(person)}><Pencil size={16} /> {person.canSuggest ? "Suggest correction" : "Edit details"}</button>}
        </div>
      </div>
      <div className="person-detail-grid">
        <section className="panel detail-facts">
          <h2>Life details</h2>
          <div><CalendarDays size={17} /><span><strong>Born</strong>{person.birthDate || person.birthYear || "Unknown"}{person.birthPlace ? ` · ${person.birthPlace}` : ""}{person.birthApproximate ? " · circa" : ""}</span></div>
          <div><CalendarDays size={17} /><span><strong>Died</strong>{person.deathDate || person.deathYear || "Not recorded"}{person.deathPlace ? ` · ${person.deathPlace}` : ""}</span></div>
          <div><MapPin size={17} /><span><strong>Residences</strong>{person.livedLocations?.length ? person.livedLocations.map((item) => item.display).join(" → ") : person.legacyLivedIn || "Not recorded"}</span></div>
          <div><GitFork size={17} /><span><strong>Branch</strong>{branchLabel}</span></div>
          {person.alternateNames?.length > 0 && (
            <div className="detail-aliases">
              <UsersRound size={17} />
              <span>
                <strong>Also known as</strong>
                <span className="alias-chip-list">
                  {person.alternateNames.map((alias, index) => (
                    <span className="alias-chip" key={`${alias.kind}-${alias.name}-${index}`} title={aliasTypeLabel(alias.kind)}>
                      {alias.name}<small>{aliasTypeLabel(alias.kind)}</small>
                    </span>
                  ))}
                </span>
              </span>
            </div>
          )}
          <div><Check size={17} /><span><strong>Provenance</strong>{person.provenanceNote || "Added in Vansh"}{person.factConfidence ? ` · ${person.factConfidence}` : ""}</span></div>
        </section>
        <section className="panel detail-trust">
          <h2>Trust & history</h2>
          <p><strong>Record status:</strong> {statusText(person)}</p>
          <p><strong>Last updated:</strong> {person.updatedAt ? new Date(person.updatedAt).toLocaleString() : "Unknown"}</p>
          <p><strong>Revision:</strong> {person.revision || 1}</p>
          <p><strong>Created by:</strong> {person.createdBy === person.linkedUserId ? "Profile owner" : "Family contributor"}</p>
          <p className="muted">Claimed profiles are controlled by the person they represent. Other relatives submit correction suggestions instead of overwriting them.</p>
          <div className="change-history">
            <strong>Change history</strong>
            {history.slice(0, 6).map((entry) => (
              <div key={entry.id}><span>{entry.operation} · revision {entry.revision || "—"}</span><small>{new Date(entry.created_at).toLocaleString()}</small></div>
            ))}
            {!history.length && <small>No recorded changes yet.</small>}
          </div>
        </section>
      </div>
      <section className="panel relation-overview">
        <div className="panel-title"><div><span className="mini-title"><UsersRound size={15} /> RELATIONSHIPS</span><h2>Immediate family</h2></div></div>
        <div className="detail-relation-columns">
          {relationGroup("Parents", relations.parents)}
          {relationGroup("Partners", relations.partners)}
          {relationGroup("Children", relations.children)}
          {relationGroup("Siblings", relations.siblings, (entry) => entry.person.name)}
        </div>
      </section>
    </div>
  );
}
