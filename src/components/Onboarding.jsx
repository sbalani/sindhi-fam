import { useState } from "react";
import { ArrowRight, Check, MapPin, UserPlus, UsersRound } from "lucide-react";
import { parentIdsFor } from "../utils/kinship.js";

export default function Onboarding({ people, relationships, self, addRelative, inviteRelative, goJourney, force = false, onHide }) {
  if (!self) return null;

  const skipKey = `vansh-onboarding-skip-grandparents:${self.id}`;
  const [grandparentsSkipped, setGrandparentsSkipped] = useState(() => window.localStorage.getItem(skipKey) === "yes");
  const parents = parentIdsFor(self.id, relationships);
  const parentPeople = parents.map((id) => people.find((person) => person.id === id)).filter(Boolean);
  const grandparents = [...new Set(parents.flatMap((id) => parentIdsFor(id, relationships)))];
  const hasPlace = people.some((person) => person.birthLocation || person.livedLocations?.length);
  const hasInviteable = people.some((person) => !person.isSelf && !person.linkedUserId && !person.isPlaceholder);

  // Onboarding should explicitly encourage two parents, but it must not trap a
  // user who does not know all four grandparents. Two known grandparents is a
  // useful starting point; users can skip that step and continue building later.
  const parentsDone = parents.length >= 2;
  const grandparentsDone = grandparents.length >= 2 || grandparentsSkipped;
  const invited = people.some((person) => person.linkedUserId && !person.isSelf);
  const steps = [
    { label: "You", done: true },
    { label: `Parents ${Math.min(parents.length, 2)}/2`, done: parentsDone },
    { label: grandparentsSkipped ? "Grandparents skipped" : `Grandparents ${Math.min(grandparents.length, 2)}/2`, done: grandparentsDone },
    { label: "Known places", done: hasPlace },
    { label: "Invite relatives", done: invited },
  ];
  const done = steps.filter((step) => step.done).length;
  if (!force && (done === steps.length || people.length > 12)) return null;

  let nextAction;
  if (!parentsDone) {
    nextAction = {
      text: parents.length === 0 ? "Add first parent" : "Add second parent",
      icon: UsersRound,
      action: () => addRelative(self),
    };
  } else if (!grandparentsDone) {
    // Choose the known parent who currently has the fewest parents of their own,
    // so the wizard naturally builds both sides rather than repeatedly anchoring
    // grandparents to the signed-in user.
    const targetParent = [...parentPeople].sort(
      (a, b) => parentIdsFor(a.id, relationships).length - parentIdsFor(b.id, relationships).length,
    )[0] || parentPeople[0] || self;
    nextAction = {
      text: `Add a grandparent${targetParent?.firstName ? ` for ${targetParent.firstName}` : ""}`,
      icon: UsersRound,
      action: () => addRelative(targetParent),
    };
  } else if (!hasPlace) {
    nextAction = { text: "Add a family place", icon: MapPin, action: goJourney };
  } else {
    nextAction = { text: hasInviteable ? "Invite a relative" : "Add an inviteable relative", icon: UserPlus, action: inviteRelative };
  }

  const Icon = nextAction.icon;
  const skipGrandparents = () => {
    window.localStorage.setItem(skipKey, "yes");
    setGrandparentsSkipped(true);
  };

  return (
    <section className="panel onboarding-panel">
      <div className="panel-title">
        <div>
          <span className="mini-title">GET STARTED</span>
          <h2>Build the first useful branch</h2>
          <p>Add both parents first, then grandparents you know. Unknown relatives can be skipped and filled in later.</p>
        </div>
        <div className="onboarding-progress-actions">
          <strong>{done}/{steps.length}</strong>
          {force && onHide && <button type="button" className="text-button" onClick={onHide}>Hide checklist</button>}
        </div>
      </div>
      <div className="onboarding-steps">
        {steps.map((step) => <span className={step.done ? "done" : ""} key={step.label}>{step.done ? <Check size={13} /> : <i />}{step.label}</span>)}
      </div>
      {done === steps.length ? (
        <div className="onboarding-complete"><Check size={16} /><strong>Setup checklist complete</strong></div>
      ) : (
        <div className="onboarding-next-actions">
          <button className="primary" onClick={nextAction.action}><Icon size={16} /> {nextAction.text} <ArrowRight size={15} /></button>
          {parentsDone && !grandparentsDone && (
            <button type="button" className="quiet" onClick={skipGrandparents}>I don't know more grandparents — continue</button>
          )}
        </div>
      )}
    </section>
  );
}
