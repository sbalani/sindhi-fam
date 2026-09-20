import { Plus, Trash2, UsersRound } from "lucide-react";
import { ensureTwoParentRows, makeEmptyParentLink } from "../utils/familyEditing.js";

const PLACEHOLDER = "__placeholder__";

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
});

export default function FamilyConnectionsEditor({
  people,
  currentPersonId,
  parentLinks,
  setParentLinks,
  partnerLinks,
  setPartnerLinks,
  anchorName = "",
  allowAnchorCoParent = false,
  disabled = false,
}) {
  const candidatePeople = people.filter((person) => person.id !== currentPersonId);

  const updateParent = (key, changes) =>
    setParentLinks((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const removeParent = (key) =>
    setParentLinks((rows) => ensureTwoParentRows(rows.filter((row) => row.key !== key)));
  const updatePartner = (key, changes) =>
    setPartnerLinks((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const removePartner = (key) =>
    setPartnerLinks((rows) => rows.filter((row) => row.key !== key));

  return (
    <div className="family-context-editor wide">
      <fieldset className="family-context-group">
        <legend><UsersRound size={15} /> Parents</legend>
        <p>
          Select an existing person when they are already in this family graph, or create a placeholder now and fill in their details later from the tree. Two rows are shown by default, but Vansh supports more than two parents.
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
                  {candidatePeople.map((person) => (
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
                  value={link.mode === "placeholder" ? PLACEHOLDER : link.personId || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    updatePartner(link.key, {
                      mode: value === PLACEHOLDER ? "placeholder" : "existing",
                      personId: value === PLACEHOLDER ? "" : value,
                    });
                  }}
                >
                  <option value="">Choose an existing person…</option>
                  {candidatePeople.map((person) => (
                    <option value={person.id} key={person.id}>{person.name}</option>
                  ))}
                  <option value={PLACEHOLDER}>Create placeholder spouse / partner…</option>
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
                  onChange={(event) => updatePartner(link.key, { provenanceNote: event.target.value })}
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
                      onChange={(event) => updatePartner(link.key, { placeholderLabel: event.target.value })}
                      placeholder="e.g. First husband / Unknown partner"
                    />
                  </label>
                  <label>
                    Wording
                    <select
                      disabled={disabled}
                      value={link.placeholderGender || "unspecified"}
                      onChange={(event) => updatePartner(link.key, { placeholderGender: event.target.value })}
                    >
                      <option value="unspecified">Not specified</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="nonbinary">Non-binary</option>
                    </select>
                  </label>
                </>
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
          onClick={() => setPartnerLinks((rows) => [...rows, emptyPartner()])}
        >
          <Plus size={15} /> Add spouse / partner
        </button>
      </fieldset>
    </div>
  );
}
