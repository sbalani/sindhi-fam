import { useState } from "react";
import { Download, LoaderCircle, LockKeyhole, Save, ShieldCheck, Trash2, X } from "lucide-react";
import AccessibleModal from "./AccessibleModal.jsx";
import LocationPicker from "../LocationPicker.jsx";

const downloadBlob = (filename, content, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function ProfilePanel({ profile, people, relationships, close, saveProfile, previewDeleteAccount, deleteAccount }) {
  const [form, setForm] = useState({
    firstName: profile?.first_name || "",
    surname: profile?.surname || "",
    birthSurname: profile?.birth_surname || "",
    birthDate: profile?.birth_date || "",
    birthLocation: profile?.birth_location || null,
    currentLocation: profile?.current_location || null,
    discoveryEnabled: Boolean(profile?.discovery_enabled),
    livingPrivacy: profile?.living_person_privacy || "relatives",
  });
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const save = async () => {
    setBusy("save");
    setMessage("");
    try {
      await saveProfile(form);
      setMessage("Profile preferences saved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  };
  const exportJson = () => {
    downloadBlob(
      `vansh-family-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), profile, people, relationships }, null, 2),
      "application/json",
    );
  };
  const exportCsv = () => {
    const header = ["id", "first_name", "surname", "birth_date", "birth_year", "death_date", "death_year", "birth_place", "residences", "claimed"];
    const rows = people.map((person) => [
      person.id, person.firstName, person.surname, person.birthDate, person.birthYear,
      person.deathDate, person.deathYear, person.birthPlace,
      (person.livedLocations || []).map((location) => location.display).join(" | "), person.isClaimed,
    ]);
    downloadBlob("vansh-family.csv", [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n"), "text/csv;charset=utf-8");
  };
  const exportGedcom = () => {
    const lines = ["0 HEAD", "1 SOUR VANSH", "1 GEDC", "2 VERS 5.5.1", "1 CHAR UTF-8"];
    people.forEach((person, index) => {
      const id = `@I${index + 1}@`;
      lines.push(`0 ${id} INDI`, `1 NAME ${person.firstName || ""} /${person.surname || ""}/`);
      if (person.birthDate || person.birthYear) {
        lines.push("1 BIRT", `2 DATE ${person.birthDate || person.birthYear}${person.birthApproximate ? " ABT" : ""}`);
        if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace}`);
      }
      if (person.deathDate || person.deathYear) {
        lines.push("1 DEAT", `2 DATE ${person.deathDate || person.deathYear}`);
        if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace}`);
      }
    });
    lines.push("0 TRLR");
    downloadBlob("vansh-family.ged", lines.join("\n"), "text/plain;charset=utf-8");
  };
  const confirmDelete = async () => {
    setBusy("delete-preview");
    setMessage("");
    try {
      const impact = await previewDeleteAccount();
      const shared = Number(impact?.sharedGraphs || 0);
      const solo = Number(impact?.soloGraphs || 0);
      const peoplePreserved = Number(impact?.familyPeoplePreserved || 0);
      const confirmed = window.confirm(
        `What account deletion will do:\n\n` +
        `• Your Vansh login and discoverable profile will be deleted.\n` +
        `• ${peoplePreserved} family person record${peoplePreserved === 1 ? "" : "s"} will remain as genealogy rather than being erased with your login.\n` +
        `• ${shared} shared tree${shared === 1 ? "" : "s"} will stay available to the other relatives who already have access.\n` +
        `• Your claimed person record becomes unclaimed; facts you contributed remain, with account attribution removed.\n` +
        (solo ? `• ${solo} tree${solo === 1 ? "" : "s"} with no other active account will be placed in a 30-day safety archive.\n` : "") +
        `\nContinue?`,
      );
      if (!confirmed) { setBusy(""); return; }
      const typed = window.prompt("Type DELETE to permanently remove your Vansh login.");
      if (typed !== "DELETE") { setBusy(""); return; }
      setBusy("delete");
      await deleteAccount();
    } catch (error) {
      setMessage(error.message);
      setBusy("");
    }
  };

  return (
    <AccessibleModal close={close} className="add-modal profile-panel" label="Personal profile and privacy settings">
      <button className="modal-close" onClick={close}><X /></button>
      <span className="mini-title"><ShieldCheck size={15} /> PERSONAL PROFILE</span>
      <h2>Your Vansh identity & privacy</h2>
      <p>These details are used for conservative identity suggestions. They are not a public profile.</p>
      <div className="form-grid">
        <label>First name<input name="firstName" value={form.firstName} onChange={update} /></label>
        <label>Surname<input name="surname" value={form.surname} onChange={update} /></label>
        <label>Birth / earlier surname<input name="birthSurname" value={form.birthSurname} onChange={update} placeholder="Optional" /></label>
        <label>Date of birth<input type="date" name="birthDate" value={form.birthDate} onChange={update} /></label>
        <label className="wide">Birthplace<LocationPicker value={form.birthLocation} legacyValue={profile?.birth_location_text || ""} onChange={(value) => setForm((current) => ({ ...current, birthLocation: value }))} /></label>
        <label className="wide">Current location<LocationPicker value={form.currentLocation} legacyValue={profile?.current_location_text || profile?.location || ""} onChange={(value) => setForm((current) => ({ ...current, currentLocation: value }))} /></label>
        <label className="wide">Living-person visibility
          <select name="livingPrivacy" value={form.livingPrivacy} onChange={update}>
            <option value="private">Only me unless explicitly shared</option>
            <option value="relatives">Verified/shared relatives</option>
            <option value="match_clues">Relatives + limited matching clues</option>
          </select>
        </label>
        <label className="inline-check wide discovery-choice"><input type="checkbox" checked={form.discoveryEnabled} onChange={(event) => setForm((current) => ({ ...current, discoveryEnabled: event.target.checked }))} />Allow Vansh to suggest my profile to possible relatives using limited matching clues.</label>
      </div>
      <div className="profile-privacy-note"><LockKeyhole size={17} /><span><strong>Living-person privacy</strong> Cross-graph matching only exposes limited clues. Full records become visible only through explicit invitation/connection access.</span></div>
      {message && <div className="auth-message success">{message}</div>}
      <button className="primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save profile</button>
      <hr />
      <h3>Export your family data</h3>
      <div className="heading-actions"><button className="quiet" onClick={exportJson}><Download size={16} /> JSON</button><button className="quiet" onClick={exportCsv}><Download size={16} /> CSV</button><button className="quiet" onClick={exportGedcom}><Download size={16} /> GEDCOM</button></div>
      <p className="muted">JSON preserves Vansh-specific trust metadata; GEDCOM provides a portable genealogy format for other family-history tools.</p>
      <hr />
      <h3>Delete account</h3>
      <p className="muted">Deleting an account does not mean deleting the family itself. Shared tree facts and relationships remain for relatives who already have access. Your claimed person becomes unclaimed and your account attribution is removed. A tree with no other active account is placed in a 30-day safety archive instead of being destroyed immediately.</p>
      <button className="danger-button" onClick={confirmDelete} disabled={busy.startsWith("delete")}>{busy.startsWith("delete") ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Delete my account</button>
    </AccessibleModal>
  );
}
