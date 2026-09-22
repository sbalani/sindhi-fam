import { Plus, Trash2, UsersRound } from "lucide-react";
import {
  ensureTwoParentRows,
  makeEmptyChildLink,
  makeEmptyParentLink,
  makeEmptySiblingLink,
} from "../utils/familyEditing.js";

const PLACEHOLDER = "__placeholder__";
const NEW_PERSON = "__new_person__";

const emptyNewPerson = () => ({
  firstName: "",
  surname: "",
  nickname: "",
  maidenName: "",
  gender: "unspecified",
  birthDate: "",
});

const emptyPartner = () => ({
  key: crypto.randomUUID(),
  relationshipId: null,
  mode: "existing",
  personId: "",
  type: "spouse",
  variant: "current",
  startYear: "",
  endYear: "",
  confidence: "reported",
  provenanceNote: "",
  placeholderLabel: "",
  placeholderGender: "unspecified",
  alsoParentOfAnchor: false,
  newPerson: emptyNewPerson(),
});

function NewPersonFields({ link, updateLink, disabled }) {
  return (
    <div className="new-connected-person-fields">
      <strong>New person details</strong>
      <label>First name<input required maxLength={100} disabled={disabled} value={link.newPerson?.firstName || ""} onChange={(event) => updateLink({ newPerson: { ...link.newPerson, firstName: event.target.value } })} /></label>
      <label>Surname<input required maxLength={100} disabled={disabled} value={link.newPerson?.surname || ""} onChange={(event) => updateLink({ newPerson: { ...link.newPerson, surname: event.target.value } })} /></label>
      <label>Nickname <small>Optional</small><input maxLength={100} disabled={disabled} value={link.newPerson?.nickname || ""} onChange={(event) => updateLink({ newPerson: { ...link.newPerson, nickname: event.target.value } })} /></label>
      <label>Maiden / earlier surname <small>Optional</small><input maxLength={160} disabled={disabled} value={link.newPerson?.maidenName || ""} onChange={(event) => updateLink({ newPerson: { ...link.newPerson, maidenName: event.target.value } })} /></label>
      <label>Gender wording<select disabled={disabled} value={link.newPerson?.gender || "unspecified"} onChange={(event) => updateLink({ newPerson: { ...link.newPerson, gender: event.target.value } })}><option value="unspecified">Not specified</option><option value="female">Female</option><option value="male">Male</option><option value="nonbinary">Non-binary</option></select></label>
      <label>Date of birth <small>Optional</small><input type="date" min="1800-01-01" max={new Date().toISOString().slice(0, 10)} disabled={disabled} value={link.newPerson?.birthDate || ""} onChange={(event) => updateLink({ newPerson: { ...link.newPerson, birthDate: event.target.value } })} /></label>
    </div>
  );
}

export default function FamilyConnectionsEditor({
  people,
  currentPersonId,
  parentLinks,
  setParentLinks,
  childLinks = null,
  setChildLinks = null,
  siblingLinks = null,
  setSiblingLinks = null,
  partnerLinks,
  setPartnerLinks,
  anchorName = "",
  allowAnchorCoParent = false,
  disabled = false,
  allowNewPeople = false,
  allowNewChildren = allowNewPeople,
  allowExistingChildCoParent = allowNewPeople,
  subjectName = "this person",
  excludedParentIds = [],
  excludedPartnerIds = [],
}) {
  const candidatePeople = people.filter((person) => person.id !== currentPersonId);
  const parentCandidates = candidatePeople.filter((person) => !excludedParentIds.includes(person.id));
  const partnerCandidates = candidatePeople.filter((person) => !excludedPartnerIds.includes(person.id));

  const updateParent = (key, changes) =>
    setParentLinks((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const removeParent = (key) =>
    setParentLinks((rows) => ensureTwoParentRows(rows.filter((row) => row.key !== key)));
  const updateChild = (key, changes) =>
    setChildLinks?.((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const removeChild = (key) =>
    setChildLinks?.((rows) => rows.filter((row) => row.key !== key));
  const clearCoParent = (personId) => {
    if (!personId || !setChildLinks) return;
    setChildLinks((rows) => rows.map((row) => row.coParentId === personId ? { ...row, coParentId: "" } : row));
  };
  const updatePartner = (key, changes) => {
    const previousPersonId = partnerLinks.find((row) => row.key === key)?.personId;
    if (changes.personId !== undefined && changes.personId !== previousPersonId) clearCoParent(previousPersonId);
    setPartnerLinks((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  };
  const removePartner = (key) => {
    clearCoParent(partnerLinks.find((row) => row.key === key)?.personId);
    setPartnerLinks((rows) => rows.filter((row) => row.key !== key));
  };
  const updateSibling = (key, changes) =>
    setSiblingLinks?.((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const removeSibling = (key) =>
    setSiblingLinks?.((rows) => rows.filter((row) => row.key !== key));
  const coParentCandidates = partnerLinks
    .filter((link) => link.mode === "existing" && link.personId)
    .map((link) => people.find((person) => person.id === link.personId))
    .filter(Boolean);

  return (
    <div className="family-context-editor wide">
      <fieldset className="family-context-group">
        <legend><UsersRound size={15} /> Parents of {subjectName}</legend>
        <p>
          Optional. Choose the people who are parents of {subjectName}. Shared parents let Vansh infer siblings without another relationship entry.
        </p>
        <div className="family-link-list">
          {parentLinks.map((link, index) => (
            <div className="family-link-row parent-link-row" key={link.key}>
              <label>
                Parent {index + 1}
                <select
                  disabled={disabled}
                  value={link.mode === "placeholder" ? PLACEHOLDER : link.personId || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateParent(link.key, {
                      mode: value === PLACEHOLDER ? "placeholder" : "existing",
                      personId: value === PLACEHOLDER ? "" : value,
                    });
                  }}
                >
                  <option value="">Choose an existing person…</option>
                  {parentCandidates.map((person) => (
                    <option value={person.id} key={person.id}>{person.name}</option>
                  ))}
                  <option value={PLACEHOLDER}>Create placeholder parent…</option>
                </select>
              </label>
              <label>
                Parent type
                <select
                  disabled={disabled}
                  value={link.variant || "biological"}
                  onChange={(event) => updateParent(link.key, { variant: event.target.value })}
                >
                  <option value="biological">Biological</option>
                  <option value="adoptive">Adoptive</option>
                  <option value="step">Step-parent</option>
                  <option value="guardian">Guardian / social parent</option>
                  <option value="unspecified">Not specified</option>
                </select>
              </label>
              <label>
                Confidence
                <select
                  disabled={disabled}
                  value={link.confidence || "reported"}
                  onChange={(event) => updateParent(link.key, { confidence: event.target.value })}
                >
                  <option value="reported">Reported</option>
                  <option value="probable">Probable</option>
                  <option value="uncertain">Uncertain</option>
                  <option value="documented">Documented</option>
                  <option value="disputed">Disputed</option>
                </select>
              </label>
              <label>
                Relationship source <small>Optional</small>
                <input
                  disabled={disabled}
                  value={link.provenanceNote || ""}
                  maxLength={1000}
                  onChange={(event) => updateParent(link.key, { provenanceNote: event.target.value })}
                  placeholder="e.g. family account or certificate"
                />
              </label>
              {link.mode === "placeholder" && (
                <>
                  <label>
                    Placeholder label
                    <input
                      disabled={disabled}
                      value={link.placeholderLabel || ""}
                      onChange={(event) => updateParent(link.key, { placeholderLabel: event.target.value })}
                      placeholder="e.g. Unknown mother / Dad's father"
                    />
                  </label>
                  <label>
                    Wording
                    <select
                      disabled={disabled}
                      value={link.placeholderGender || "unspecified"}
                      onChange={(event) => updateParent(link.key, { placeholderGender: event.target.value })}
                    >
                      <option value="unspecified">Not specified</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="nonbinary">Non-binary</option>
                    </select>
                  </label>
                </>
              )}
              <button
                type="button"
                className="icon-danger family-link-remove"
                onClick={() => removeParent(link.key)}
                disabled={disabled}
                aria-label={`Remove parent ${index + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="quiet family-context-add"
          disabled={disabled}
          onClick={() => setParentLinks((rows) => [...rows, makeEmptyParentLink()])}
        >
          <Plus size={15} /> Add another parent
        </button>
      </fieldset>

      {childLinks && setChildLinks && (
        <fieldset className="family-context-group">
          <legend>Children of {subjectName}</legend>
          <p>{allowNewChildren ? `Choose an existing person or create a new child of ${subjectName}.` : `Optional. Choose existing people for whom ${subjectName} is a parent.`}</p>
          <div className="family-link-list">
            {childLinks.map((link, index) => (
              <div className="family-link-row parent-link-row" key={link.key}>
                <label>
                  Child {index + 1}
                  <select
                    disabled={disabled}
                    value={link.mode === "new" ? NEW_PERSON : link.personId || ""}
                    onChange={(event) => updateChild(link.key, {
                      mode: event.target.value === NEW_PERSON ? "new" : "existing",
                      personId: event.target.value === NEW_PERSON ? "" : event.target.value,
                    })}
                  >
                    <option value="">Choose an existing person…</option>
                    {candidatePeople
                      .filter((person) => person.id === link.personId || !childLinks.some((row) => row.personId === person.id))
                      .map((person) => (
                      <option value={person.id} key={person.id}>{person.name}</option>
                      ))}
                    {allowNewChildren && <option value={NEW_PERSON}>Create a new child with details…</option>}
                  </select>
                </label>
                <label>
                  Parent type
                  <select
                    disabled={disabled}
                    value={link.variant || "biological"}
                    onChange={(event) => updateChild(link.key, { variant: event.target.value })}
                  >
                    <option value="biological">Biological</option>
                    <option value="adoptive">Adoptive</option>
                    <option value="step">Step-parent</option>
                    <option value="guardian">Guardian / social parent</option>
                    <option value="unspecified">Not specified</option>
                  </select>
                </label>
                {allowNewChildren && coParentCandidates.length > 0 &&
                  (link.mode === "new" || allowExistingChildCoParent) && (
                  <label>
                    Other parent <small>Optional</small>
                    <select disabled={disabled} value={link.coParentId || ""} onChange={(event) => updateChild(link.key, { coParentId: event.target.value })}>
                      <option value="">Only {subjectName}</option>
                      {coParentCandidates.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
                    </select>
                  </label>
                )}
                {link.mode === "new" && (
                  <NewPersonFields link={link} updateLink={(changes) => updateChild(link.key, changes)} disabled={disabled} />
                )}
                <label>
                  Confidence
                  <select
                    disabled={disabled}
                    value={link.confidence || "reported"}
                    onChange={(event) => updateChild(link.key, { confidence: event.target.value })}
                  >
                    <option value="reported">Reported</option>
                    <option value="probable">Probable</option>
                    <option value="uncertain">Uncertain</option>
                    <option value="documented">Documented</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </label>
                <label>
                  Relationship source <small>Optional</small>
                  <input
                    disabled={disabled}
                    value={link.provenanceNote || ""}
                    maxLength={1000}
                    onChange={(event) => updateChild(link.key, { provenanceNote: event.target.value })}
                    placeholder="e.g. family account or certificate"
                  />
                </label>
                <button
                  type="button"
                  className="icon-danger family-link-remove"
                  onClick={() => removeChild(link.key)}
                  disabled={disabled}
                  aria-label={`Remove child ${index + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          {!childLinks.length && <small className="family-context-empty">No child selected.</small>}
          <button
            type="button"
            className="quiet family-context-add"
            disabled={disabled}
            onClick={() => setChildLinks((rows) => [...rows, {
              ...makeEmptyChildLink(),
              mode: allowNewChildren ? "new" : "existing",
            }])}
          >
            <Plus size={15} /> Add child
          </button>
        </fieldset>
      )}

      {allowNewPeople && siblingLinks && setSiblingLinks && (
        <fieldset className="family-context-group">
          <legend>Siblings of {subjectName}</legend>
          <p>Create a sibling. By default Vansh copies all parents currently recorded for {subjectName}.</p>
          <div className="family-link-list">
            {siblingLinks.map((link, index) => (
              <div className="family-link-row sibling-link-row" key={link.key}>
                <NewPersonFields link={link} updateLink={(changes) => updateSibling(link.key, changes)} disabled={disabled} />
                <label className="inline-check co-parent-choice">
                  <input type="checkbox" disabled={disabled} checked={Boolean(link.hasDifferentParents)} onChange={(event) => updateSibling(link.key, { hasDifferentParents: event.target.checked })} />
                  Has different parents (record as half sibling)
                </label>
                <label>
                  Confidence
                  <select disabled={disabled} value={link.confidence || "reported"} onChange={(event) => updateSibling(link.key, { confidence: event.target.value })}>
                    <option value="reported">Reported</option><option value="probable">Probable</option><option value="uncertain">Uncertain</option><option value="documented">Documented</option><option value="disputed">Disputed</option>
                  </select>
                </label>
                <label>Relationship source <small>Optional</small><input disabled={disabled} maxLength={1000} value={link.provenanceNote || ""} onChange={(event) => updateSibling(link.key, { provenanceNote: event.target.value })} /></label>
                <button type="button" className="icon-danger family-link-remove" onClick={() => removeSibling(link.key)} disabled={disabled} aria-label={`Remove sibling ${index + 1}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          {!siblingLinks.length && <small className="family-context-empty">No new sibling added.</small>}
          <button type="button" className="quiet family-context-add" disabled={disabled} onClick={() => setSiblingLinks((rows) => [...rows, makeEmptySiblingLink()])}>
            <Plus size={15} /> Add sibling
          </button>
        </fieldset>
      )}

      <fieldset className="family-context-group">
        <legend>Spouses & partners</legend>
        <p>
          Add current or former relationships here. For marriages, record the marriage year and optionally the divorce/end year. Add another row for remarriage or another partner.
        </p>
        <div className="family-link-list">
          {partnerLinks.map((link, index) => (
            <div className="family-link-row partner-link-row" key={link.key}>
              <label>
                {link.type === "partner" ? "Partner" : "Spouse"} {index + 1}
                <select
                  disabled={disabled}
                  value={link.mode === "new" ? NEW_PERSON : link.personId || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    updatePartner(link.key, {
                      mode: value === NEW_PERSON ? "new" : "existing",
                      personId: value === NEW_PERSON ? "" : value,
                      newPerson: link.newPerson || emptyNewPerson(),
                    });
                  }}
                >
                  <option value="">Choose an existing person…</option>
                  {partnerCandidates.map((person) => (
                    <option value={person.id} key={person.id}>{person.name}</option>
                  ))}
                  {allowNewPeople && <option value={NEW_PERSON}>Create a new person with details…</option>}
                </select>
              </label>
              <label>
                Relationship
                <select
                  disabled={disabled}
                  value={link.type || "spouse"}
                  onChange={(event) => updatePartner(link.key, { type: event.target.value })}
                >
                  <option value="spouse">Marriage / spouse</option>
                  <option value="partner">Partner</option>
                </select>
              </label>
              <label>
                {link.type === "spouse" ? "Year married" : "Year relationship began"}
                <input
                  disabled={disabled}
                  inputMode="numeric"
                  maxLength={4}
                  value={link.startYear || ""}
                  onChange={(event) => updatePartner(link.key, { startYear: event.target.value })}
                  placeholder="Optional"
                />
              </label>
              <label>
                {link.type === "spouse" ? "Divorce / end year" : "End year"}
                <input
                  disabled={disabled}
                  inputMode="numeric"
                  maxLength={4}
                  value={link.endYear || ""}
                  onChange={(event) => updatePartner(link.key, {
                    endYear: event.target.value,
                    variant: event.target.value ? "former" : link.variant,
                  })}
                  placeholder="Optional"
                />
              </label>
              <label>
                Status
                <select
                  disabled={disabled}
                  value={link.variant || "current"}
                  onChange={(event) => updatePartner(link.key, { variant: event.target.value })}
                >
                  <option value="current">Current</option>
                  <option value="former">Former</option>
                  <option value="unspecified">Not specified</option>
                </select>
              </label>
              <label>
                Confidence
                <select
                  disabled={disabled}
                  value={link.confidence || "reported"}
                  onChange={(event) => updatePartner(link.key, { confidence: event.target.value })}
                >
                  <option value="reported">Reported</option>
                  <option value="probable">Probable</option>
                  <option value="uncertain">Uncertain</option>
                  <option value="documented">Documented</option>
                  <option value="disputed">Disputed</option>
                </select>
              </label>
              <label>
                Relationship source <small>Optional</small>
                <input
                  disabled={disabled}
                  value={link.provenanceNote || ""}
                  maxLength={1000}
                  onChange={(event) => updatePartner(link.key, { provenanceNote: event.target.value })}
                  placeholder="e.g. family account or certificate"
                />
              </label>
              {link.mode === "new" && (
                <NewPersonFields link={link} updateLink={(changes) => updatePartner(link.key, changes)} disabled={disabled} />
              )}
              {allowAnchorCoParent && (
                <label className="inline-check co-parent-choice">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={Boolean(link.alsoParentOfAnchor)}
                    onChange={(event) => updatePartner(link.key, { alsoParentOfAnchor: event.target.checked })}
                  />
                  Also link as a parent of {anchorName || "the related person"}
                </label>
              )}
              <button
                type="button"
                className="icon-danger family-link-remove"
                onClick={() => removePartner(link.key)}
                disabled={disabled}
                aria-label={`Remove spouse or partner ${index + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {!partnerLinks.length && <small className="family-context-empty">No spouse or partner recorded yet.</small>}
        <button
          type="button"
          className="quiet family-context-add"
          disabled={disabled}
          onClick={() => setPartnerLinks((rows) => [...rows, {
            ...emptyPartner(),
            mode: allowNewPeople ? "new" : "existing",
          }])}
        >
          <Plus size={15} /> Add spouse / partner
        </button>
      </fieldset>
    </div>
  );
}
