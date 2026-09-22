import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookHeart,
  Check,
  CircleHelp,
  GitFork,
  HeartHandshake,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Send,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./supabase.js";
import LocationPicker from "./LocationPicker.jsx";
import JourneyMap from "./components/JourneyMap.jsx";
import PersonDetail from "./components/PersonDetail.jsx";
import Onboarding from "./components/Onboarding.jsx";
import VoiceFamilyImport from "./VoiceFamilyImport.jsx";
import ProfilePanel from "./components/ProfilePanel.jsx";
import SearchResults from "./components/SearchResults.jsx";
import FamilyConnectionsEditor from "./components/FamilyConnectionsEditor.jsx";
import AccessibleModal from "./components/AccessibleModal.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { LegalPage, SiteFooter } from "./components/LegalPages.jsx";
import useUrlPage from "./hooks/useUrlPage.js";
import useDialogAccessibility from "./hooks/useDialogAccessibility.js";
import {
  buildTraditionalTreeLayout,
  deriveBranchLabel,
  parentIdsFor,
  shortestRelationshipPath,
  siblingDetailsFor,
  surnameSuggestionsFor,
} from "./utils/kinship.js";
import { validatePersonForm } from "./utils/validation.js";
import { matchesAnyField } from "./utils/sindhiSearch.js";
import { NAME_ALIAS_KINDS } from "./utils/nameAliases.js";
import {
  connectionBundleFromForm,
  correctionSubmissionOutcome,
  ensureTwoParentRows,
  hasExistingConnection,
  loadConnectionSnapshots,
  parentLinksForMember,
  primaryConnectionFromForm,
  relationSwitchValues,
  relationshipRpcArgs,
} from "./utils/familyEditing.js";
import { buildVoiceImportPayload } from "./utils/voiceImport.js";

const nav = [
  { id: "home", label: "Overview", icon: LayoutDashboard },
  { id: "family", label: "My family", icon: UsersRound },
  { id: "tree", label: "Family tree", icon: Network },
  { id: "journey", label: "Family journey", icon: MapPin },
  { id: "matches", label: "Connections", icon: Sparkles },
];

const APP_VERSION = "0.17.2";

const RELATION_OPTIONS = [
  {
    value: "father",
    label: "Father",
    term: "Baba / Pita",
    type: "parent",
    gender: "male",
    direction: "to-anchor",
  },
  {
    value: "mother",
    label: "Mother",
    term: "Amma / Maa",
    type: "parent",
    gender: "female",
    direction: "to-anchor",
  },
  {
    value: "son",
    label: "Son",
    term: "Beta / Putar",
    type: "parent",
    gender: "male",
    direction: "from-anchor",
  },
  {
    value: "daughter",
    label: "Daughter",
    term: "Beti / Dhee",
    type: "parent",
    gender: "female",
    direction: "from-anchor",
  },
  {
    value: "brother",
    label: "Brother",
    term: "Bhai / Bhau",
    type: "sibling",
    gender: "male",
    direction: "symmetric",
  },
  {
    value: "sister",
    label: "Sister",
    term: "Behen / Bhen",
    type: "sibling",
    gender: "female",
    direction: "symmetric",
  },
  {
    value: "husband",
    label: "Husband",
    term: "Pati / Ghot",
    type: "spouse",
    gender: "male",
    direction: "symmetric",
  },
  {
    value: "wife",
    label: "Wife",
    term: "Patni / Gharwari",
    type: "spouse",
    gender: "female",
    direction: "symmetric",
  },
  {
    value: "parent",
    label: "Parent",
    term: "",
    type: "parent",
    gender: "unspecified",
    direction: "to-anchor",
  },
  {
    value: "child",
    label: "Child",
    term: "",
    type: "parent",
    gender: "unspecified",
    direction: "from-anchor",
  },
  {
    value: "sibling",
    label: "Sibling",
    term: "",
    type: "sibling",
    gender: "unspecified",
    direction: "symmetric",
  },
  {
    value: "partner",
    label: "Partner",
    term: "",
    type: "partner",
    gender: "unspecified",
    direction: "symmetric",
  },
];

const colors = ["teal", "saffron", "plum", "indigo", "terracotta", "rose"];

const residencePeriod = (location) => {
  if (location.startYear && location.endYear)
    return `${location.startYear}-${location.endYear}`;
  if (location.startYear) return `${location.startYear}-present`;
  if (location.endYear) return `until ${location.endYear}`;
  return "";
};

const residenceLabel = (location) =>
  [location.display, residencePeriod(location)].filter(Boolean).join(" · ");

const personFromRow = (row, index = 0, currentUserId = "") => {
  const isClaimed = Boolean(row.linked_user_id);
  const isIdentityOwner = row.linked_user_id === currentUserId;
  const canManageUnclaimed =
    !isClaimed &&
    (row.owner_id === currentUserId ||
      row.created_by === currentUserId ||
      row.filled_by === currentUserId);

  return {
    id: row.id,
    personIdentityId: row.person_identity_id,
    firstName: row.is_placeholder
      ? row.placeholder_label || "Unknown relative"
      : row.first_name,
    surname: row.surname,
    nickname: row.nickname || "",
    maidenName: row.maiden_name || "",
    alternateNames: Array.isArray(row.alternate_names)
      ? row.alternate_names.filter((alias) => alias && typeof alias.name === "string" && alias.name.trim())
      : [],
    birthYear: row.birth_year?.toString() || "",
    birthDate: row.birth_date || "",
    birthApproximate: Boolean(row.birth_approximate),
    birthLocation: row.birth_location || null,
    deathYear: row.death_year?.toString() || "",
    deathDate: row.death_date || "",
    deathApproximate: Boolean(row.death_approximate),
    deathLocation: row.death_location || null,
    deathPlace: row.death_location?.display || row.death_place || "",
    livedLocations: row.lived_locations || [],
    birthPlace: row.birth_location?.display || row.birth_place || "",
    livedIn: row.lived_locations?.length
      ? row.lived_locations.map((location) => location.display).join(" · ")
      : row.lived_in || "",
    legacyBirthPlace: !row.birth_location ? row.birth_place || "" : "",
    legacyLivedIn: !row.lived_locations?.length ? row.lived_in || "" : "",
    side: row.family_side || "Other",
    gender: row.gender || "unspecified",
    factConfidence: row.fact_confidence || "reported",
    provenanceNote: row.provenance_note || "",
    privacyLevel: row.privacy_level || "family",
    revision: row.revision || 1,
    relationshipHash: row._relationship_hash || null,
    connectionSnapshot: row._connection_snapshot || null,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    confirmationCount: row.confirmation_count || 0,
    isSelf: Boolean(row.is_self && row.owner_id === currentUserId),
    ownerId: row.owner_id,
    createdBy: row.created_by,
    linkedUserId: row.linked_user_id,
    isClaimed,
    isIdentityOwner,
    isPlaceholder: row.is_placeholder,
    placeholderLabel: row.placeholder_label,
    filledBy: row.filled_by,
    canEdit: isIdentityOwner || canManageUnclaimed,
    canSuggest: !row.is_placeholder && !isIdentityOwner && !canManageUnclaimed,
    canDelete:
      !isClaimed &&
      !row.is_self &&
      (row.created_by === currentUserId || row.owner_id === currentUserId),
    name: row.is_placeholder
      ? row.placeholder_label || "Unknown relative"
      : [row.first_name, row.nickname ? `"${row.nickname}"` : null, row.surname]
          .filter(Boolean)
          .join(" "),
    initials: row.is_placeholder
      ? "?"
      : `${row.first_name?.[0] || ""}${row.surname?.[0] || ""}`.toUpperCase(),
    color: colors[index % colors.length],
  };
};

const familyStateFromRows = (memberRows, relationshipRows, currentUserId) => {
  const degrees = new Map();
  relationshipRows.forEach((row) => {
    degrees.set(row.person_a_id, (degrees.get(row.person_a_id) || 0) + 1);
    degrees.set(row.person_b_id, (degrees.get(row.person_b_id) || 0) + 1);
  });
  const groups = new Map();
  memberRows.forEach((row) => {
    const key = row.linked_user_id
      ? `user:${row.linked_user_id}`
      : row.person_identity_id
        ? `identity:${row.person_identity_id}`
        : `member:${row.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const canonicalId = new Map();
  const representatives = [];
  for (const rows of groups.values()) {
    const ranked = [...rows].sort((a, b) => {
      const degreeDiff = (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0);
      if (degreeDiff) return degreeDiff;
      const selfDiff = Number(Boolean(b.is_self && b.owner_id === currentUserId)) - Number(Boolean(a.is_self && a.owner_id === currentUserId));
      if (selfDiff) return selfDiff;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    const representative = { ...ranked[0] };
    representative.is_self = rows.some((row) => row.is_self && row.owner_id === currentUserId);
    representative._source_ids = rows.map((row) => row.id);
    rows.forEach((row) => canonicalId.set(row.id, representative.id));
    representatives.push(representative);
  }
  const people = representatives.map((row, index) => ({
    ...personFromRow(row, index, currentUserId),
    sourceIds: row._source_ids || [row.id],
  }));
  const seenRelationships = new Set();
  const relationships = relationshipRows
    .map((row) => ({
      id: row.id,
      from: canonicalId.get(row.person_a_id) || row.person_a_id,
      to: canonicalId.get(row.person_b_id) || row.person_b_id,
      type: row.relationship_type,
      variant: row.relationship_variant || "unspecified",
      startYear: row.start_year,
      endYear: row.end_year,
      status: row.relationship_status || "unspecified",
      confidence: row.confidence || "reported",
      provenanceNote: row.provenance_note || "",
      revision: row.revision || 1,
    }))
    .filter((row) => {
      if (row.from === row.to) return false;
      const symmetric = ["sibling", "spouse", "partner"].includes(row.type);
      const ends = symmetric ? [row.from, row.to].sort().join(":") : `${row.from}:${row.to}`;
      const key = `${row.type}:${row.variant}:${ends}`;
      if (seenRelationships.has(key)) return false;
      seenRelationships.add(key);
      return true;
    });
  return { people, relationships };
};

const sharedTreeStateFromSnapshot = (snapshot) => ({
  ownerName: snapshot?.tree_owner_name || "Friend",
  ownerMemberId: snapshot?.tree_owner_member_id || "",
  viewerMemberId: snapshot?.viewer_member_id || "",
  people: (snapshot?.people || []).map((person, index) => ({
    id: person.id,
    firstName: person.first_name,
    surname: person.surname || "",
    name: person.display_name,
    initials: person.initials,
    gender: person.gender || "unspecified",
    isSelf: Boolean(person.is_viewer),
    isPlaceholder: Boolean(person.is_placeholder),
    color: colors[index % colors.length],
  })),
  relationships: (snapshot?.relationships || []).map((relationship) => ({
    id: relationship.id,
    from: relationship.from,
    to: relationship.to,
    type: relationship.type,
    variant: relationship.variant || "unspecified",
    status: relationship.status || "unspecified",
  })),
});

function AuthScreen() {
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({
    firstName: "",
    surname: "",
    birthSurname: "",
    birthDate: "",
    birthLocation: null,
    location: null,
    discoveryEnabled: true,
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const update = (event) =>
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: {
              emailRedirectTo: window.location.origin,
              data: {
                display_name: `${form.firstName.trim()} ${form.surname.trim()}`.trim(),
                first_name: form.firstName.trim(),
                family_surname: form.surname.trim(),
                birth_surname: form.birthSurname.trim() || null,
                birth_date: form.birthDate || null,
                birth_location: form.birthLocation?.display || null,
                location: form.location?.display || null,
                birth_location_data: form.birthLocation,
                current_location_data: form.location,
                discovery_enabled: form.discoveryEnabled,
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session)
      setMessage(
        "Check your email to confirm your account, then return here to sign in.",
      );
    setBusy(false);
  };
  if (!isSupabaseConfigured)
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>Vansh needs configuration</h1>
          <p>
            Supabase environment variables are missing from this deployment.
          </p>
        </div>
      </div>
    );
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <GitFork size={22} />
          </div>
          <div>
            <strong>Vansh</strong>
            <span>Our roots, connected</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">A LIVING FAMILY ARCHIVE</span>
          <h1>Every family has a story worth connecting.</h1>
          <p>
            Build your private Sindhi family map, preserve the places that
            shaped it, and discover shared branches over time.
          </p>
        </div>
        <div className="auth-promise">
          <ShieldCheck />
          <span>
            <strong>Private by default</strong>Your family details are visible
            only to you. Matching shares limited clues, never your full tree.
          </span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-card" onSubmit={submit}>
          <span className="mini-title">WELCOME TO VANSH</span>
          <h2>
            {mode === "signup" ? "Begin your family story" : "Welcome back"}
          </h2>
          <p>
            {mode === "signup"
              ? "Start with your details. You can add relatives next."
              : "Sign in to continue building your family map."}
          </p>
          {mode === "signup" && (
            <div className="form-grid">
              <label>
                First name
                <input
                  required
                  name="firstName"
                  value={form.firstName}
                  onChange={update}
                  placeholder="e.g. Soham"
                />
              </label>
              <label>
                Family surname
                <input
                  required
                  name="surname"
                  value={form.surname}
                  onChange={update}
                  placeholder="e.g. Advani"
                />
              </label>
              <label>
                Birth / earlier surname <small>Optional</small>
                <input
                  name="birthSurname"
                  value={form.birthSurname}
                  onChange={update}
                  placeholder="If different"
                />
              </label>
              <label>
                Date of birth <small>Optional</small>
                <input
                  type="date"
                  name="birthDate"
                  value={form.birthDate}
                  onChange={update}
                />
              </label>
              <label>
                Place of birth <small>Optional</small>
                <LocationPicker
                  value={form.birthLocation}
                  onChange={(value) => setForm((current) => ({ ...current, birthLocation: value }))}
                />
              </label>
              <label className="wide">
                Where do you live? <small>Optional</small>
                <LocationPicker
                  value={form.location}
                  onChange={(value) => setForm((current) => ({ ...current, location: value }))}
                />
              </label>
              <label className="inline-check wide discovery-choice">
                <input
                  type="checkbox"
                  checked={form.discoveryEnabled}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      discoveryEnabled: event.target.checked,
                    }))
                  }
                />
                Allow Vansh to privately suggest possible identity or family matches.
              </label>
            </div>
          )}
          <label className="auth-label">
            Email address
            <input
              required
              type="email"
              name="email"
              value={form.email}
              onChange={update}
              placeholder="you@example.com"
            />
          </label>
          <label className="auth-label">
            Password
            <input
              required
              minLength="8"
              type="password"
              name="password"
              value={form.password}
              onChange={update}
              placeholder="At least 8 characters"
            />
          </label>
          {message && (
            <div
              className={`auth-message ${message.startsWith("Check") ? "success" : ""}`}
            >
              <Mail size={16} /> {message}
            </div>
          )}
          <button className="primary auth-submit" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle className="spin" size={17} /> Please wait
              </>
            ) : mode === "signup" ? (
              <>
                Create my private space <ArrowRight size={17} />
              </>
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </button>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setMessage("");
            }}
          >
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "New to Vansh? Create an account"}
          </button>
          {mode === "signup" && (
            <p className="auth-legal-copy">
              By creating an account, you agree to the <a href="/terms">Terms of Use</a> and acknowledge the <a href="/privacy">Privacy Policy</a>.
            </p>
          )}
          <div className="form-privacy">
            <LockKeyhole size={14} /> Your information is encrypted and
            protected by account-level access rules.
          </div>
        </form>
      </section>
      <SiteFooter className="auth-site-footer" />
    </div>
  );
}

function Avatar({ person, size = "medium" }) {
  return (
    <div className={`avatar ${person.color || "teal"} ${size}`}>
      {person.initials}
    </div>
  );
}

function Sidebar({ page, setPage, open, close, people, openNotes, notificationCount = 0 }) {
  return (
    <>
      {open && (
        <button className="scrim" onClick={close} aria-label="Close menu" />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <GitFork size={22} />
          </div>
          <div>
            <strong>Vansh</strong>
            <span>Our roots, connected</span>
          </div>
        </div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(id);
                close();
              }}
              key={id}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "matches" && notificationCount > 0 && (
                <b>{notificationCount}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <BookHeart size={20} />
          <strong>Your family story</strong>
          <p>
            You have added {people.length}{" "}
            {people.length === 1 ? "person" : "people"} across{" "}
            {
              new Set(
                people
                  .flatMap((person) => [person.surname, person.maidenName])
                  .filter(Boolean)
                  .map((name) => name.toLowerCase()),
              ).size
            }{" "}
            surnames.
          </p>
          <div>
            <i style={{ width: `${Math.min(100, 15 + people.length * 8)}%` }} />
          </div>
          <span>Keep adding what you know</span>
        </div>
        <div className="sidebar-footer">
          <span>
            <ShieldCheck size={17} /> Private by default
          </span>
          <button
            onClick={() => {
              close();
              openNotes();
            }}
          >
            v{APP_VERSION}
          </button>
        </div>
      </aside>
    </>
  );
}

function PatchNotes({ close }) {
  const dialogRef = useDialogAccessibility(close);
  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <section ref={dialogRef} className="review-modal patch-notes" role="dialog" aria-modal="true" aria-label="Vansh release notes" tabIndex={-1}>
        <button className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="mini-title">VANSH v{APP_VERSION}</span>
        <h2>What’s new</h2>
        <p>
          Both sides of a married couple now remain connected to their own
          parents and siblings.
        </p>
        <div className="release-list">
          <div>
            <Network />
            <span>
              <strong>Two ancestral sides</strong>Maternal and paternal
              grandparents connect independently to the same parent couple.
            </span>
          </div>
          <div>
            <BookHeart />
            <span>
              <strong>Side-aware siblings</strong>Each parent’s siblings stay
              beside that parent rather than being detached by the marriage.
            </span>
          </div>
          <div>
            <UserPlus />
            <span>
              <strong>Measured connectors</strong>Lines now join the actual
              rendered cards instead of relying on one nested branch owner.
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>One couple, no duplication</strong>Spouses appear once
              while preserving incoming family links from both sides.
            </span>
          </div>
        </div>
        <button className="primary" onClick={close}>
          Continue
        </button>
      </section>
    </div>
  );
}

function Header({ setMenu, query, setQuery, profile, self, signOut, notificationCount = 0, onNotifications, onProfile }) {
  const current = self || {
    initials: profile?.display_name?.slice(0, 2).toUpperCase() || "VF",
    color: "terracotta",
  };
  return (
    <header>
      <button className="mobile-menu icon-button" onClick={() => setMenu(true)}>
        <Menu />
      </button>
      <div className="global-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names or places — Roman Sindhi or سنڌي"
        />
      </div>
      <button
        className="icon-button notification"
        onClick={onNotifications}
        title="Open verification inbox"
        aria-label={`Open verification inbox${notificationCount ? `, ${notificationCount} pending` : ""}`}
      >
        <Bell size={19} />
        {notificationCount > 0 && <b>{notificationCount}</b>}
      </button>
      <div className="header-user">
        <button className="profile-summary" onClick={onProfile} title="Open personal profile and privacy settings">
          <Avatar person={current} size="small" />
          <span>
            <strong>{profile?.display_name?.split(" ")[0] || "Family keeper"}</strong>
            <small>Personal profile</small>
          </span>
        </button>
        <button className="signout" onClick={signOut} title="Sign out" aria-label="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

function Stat({ icon: Icon, value, label, tone }) {
  return (
    <div className="stat">
      <div className={`stat-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function Overview({ people, relationships, matches, identityCandidates = [], profile, setPage, openAdd, inviteRelative, openSurnames, addFamilyPlace }) {
  const [showSetupChecklist, setShowSetupChecklist] = useState(false);
  const allSurnameData = Object.values(
    people
      .flatMap((person) =>
        [...new Set([person.surname, person.maidenName].filter(Boolean))].map(
          (name) => ({ name, person }),
        ),
      )
      .reduce((result, entry) => {
        const key = entry.name.toLowerCase();
        result[key] ||= {
          name: entry.name,
          count: 0,
          place: entry.person.birthPlace || "Place unknown",
        };
        result[key].count += 1;
        if (result[key].place === "Place unknown" && entry.person.birthPlace)
          result[key].place = entry.person.birthPlace;
        return result;
      }, {}),
  );
  const surnameData = allSurnameData.slice(0, 4);
  const places = [
    ...new Set(
      people.flatMap((person) =>
        [
          person.birthPlace,
          ...person.livedLocations.map((location) => location.display),
          person.legacyLivedIn,
        ].filter(Boolean),
      ),
    ),
  ];
  return (
    <div className="page">
      <section className="welcome">
        <div>
          <span className="eyebrow">YOUR PRIVATE FAMILY SPACE</span>
          <h1>Namaste, {profile?.display_name?.split(" ")[0] || "friend"}.</h1>
          <p>Every name you add makes your family's story a little clearer.</p>
        </div>
        <div className="welcome-actions">
          <button className="secondary" type="button" onClick={() => setShowSetupChecklist(true)}>Setup checklist</button>
          <button className="primary" onClick={() => openAdd()}>
            <Plus size={18} /> Add family member
          </button>
        </div>
      </section>
      <Onboarding
        people={people}
        relationships={relationships}
        self={people.find((person) => person.isSelf)}
        addRelative={openAdd}
        inviteRelative={inviteRelative}
        goJourney={addFamilyPlace}
        force={showSetupChecklist}
        onHide={() => setShowSetupChecklist(false)}
      />
      {identityCandidates.length > 0 && (
        <section className="identity-alert panel">
          <div>
            <span className="mini-title"><ShieldCheck size={15} /> IDENTITY SUGGESTION</span>
            <h2>We found an existing record that may be you</h2>
            <p>{identityCandidates[0].name} · match score {identityCandidates[0].score}. Nothing is linked until you request the claim and the existing record owner approves.</p>
          </div>
          <button className="primary" onClick={() => setPage("matches")}>Review suggestion <ArrowRight size={15} /></button>
        </section>
      )}
      <section className="stats">
        <Stat
          icon={UsersRound}
          value={people.length}
          label="People added"
          tone="green"
        />
        <Stat
          icon={Link2}
          value={allSurnameData.length}
          label="Family surnames"
          tone="orange"
        />
        <Stat
          icon={Sparkles}
          value={matches.length}
          label="Possible connections"
          tone="purple"
        />
        <Stat
          icon={MapPin}
          value={places.length}
          label="Places in your story"
          tone="blue"
        />
      </section>
      <div className="dashboard-grid">
        <section className="panel matches-panel">
          <div className="panel-title">
            <div>
              <span className="mini-title">
                <Sparkles size={15} /> CONNECTIONS TO EXPLORE
              </span>
              <h2>We may have found your people</h2>
              <p>Based on shared names, places and family details.</p>
            </div>
            <button className="text-button" onClick={() => setPage("matches")}>
              See all <ArrowRight size={15} />
            </button>
          </div>
          <div className="match-list">
            {matches.slice(0, 2).map((match) => (
              <div className="match" key={match.id}>
                <Avatar person={match} />
                <div className="match-main">
                  <div>
                    <h3>{match.name}</h3>
                    <span>{match.details}</span>
                  </div>
                  <div className="chips">
                    {match.shared.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <p>
                    <GitFork size={14} /> Shared family details
                  </p>
                </div>
                <div className="confidence">
                  <strong>{match.score}</strong>
                  <span>match score</span>
                </div>
                <button
                  className="secondary"
                  onClick={() => setPage("matches")}
                >
                  Review
                </button>
              </div>
            ))}
          </div>
          {!matches.length && (
            <div className="empty">
              <Sparkles size={24} />
              <h3>No connections yet</h3>
              <p>Add relatives, surnames and places to improve matching.</p>
            </div>
          )}
        </section>
        <aside className="panel surnames-panel">
          <div className="panel-title">
            <div>
              <span className="mini-title">YOUR FAMILY NAMES</span>
              <h2>Surname threads</h2>
            </div>
            <button className="round-add" onClick={openAdd}>
              <Plus size={18} />
            </button>
          </div>
          <div className="surname-list">
            {surnameData.map((surname, index) => (
              <div key={surname.name}>
                <span className={`surname-num n${index}`}>
                  {surname.name[0]}
                </span>
                <div>
                  <strong>{surname.name}</strong>
                  <span>{surname.place}</span>
                </div>
                <b>
                  {surname.count}
                  <small> people</small>
                </b>
              </div>
            ))}
          </div>
          {!surnameData.length && (
            <div className="empty">
              <p>Add a family member to begin.</p>
            </div>
          )}
          <button className="full-link" onClick={() => (openSurnames ? openSurnames() : setPage("family"))}>
            Explore all surnames <ArrowRight size={15} />
          </button>
        </aside>
        <section className="panel journey">
          <div>
            <span className="mini-title">
              <MapPin size={14} /> FAMILY JOURNEY
            </span>
            <h2>The places in your story</h2>
            <p>
              {places.length
                ? `${places.length} recorded places across your family.`
                : "Add birthplaces and cities to trace your family journey."}
            </p>
          </div>
          <div className="journey-track">
            {places.slice(0, 4).map((place, index) => (
              <div key={place}>
                <i>{index + 1}</i>
                <strong>{place}</strong>
                <span>Recorded</span>
              </div>
            ))}
          </div>
        </section>
        <aside className="panel tip">
          <Lightbulb size={23} />
          <div>
            <span className="mini-title">A GOOD NEXT STEP</span>
            <h3>Add your grandparents' birthplaces</h3>
            <p>
              Places from before Partition can significantly improve connection
              matches.
            </p>
            <button onClick={openAdd}>
              Add details <ArrowRight size={14} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Family({
  people,
  relationships,
  openAdd,
  editPerson,
  deletePerson,
  invitePerson,
  openMerge,
  openPerson,
  openVoice,
  initialView = "people",
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [viewMode, setViewMode] = useState(initialView);
  const self = people.find((person) => person.isSelf) || people[0];
  const branchFor = (person) =>
    deriveBranchLabel(person.id, self?.id, people, relationships);
  const branches = [...new Set(people.map(branchFor))].filter(Boolean).sort();
  const filteredPeople = people.filter((person) => {
    const searchableFields = [
      person.name,
      person.firstName,
      person.surname,
      person.maidenName,
      ...(person.alternateNames || []).map((alias) => alias.name),
      person.birthPlace,
      person.livedIn,
      person.legacyLivedIn,
      ...(person.livedLocations || []).map((location) => location.display),
    ];
    return (
      (!localQuery || matchesAnyField(localQuery, searchableFields)) &&
      (branchFilter === "all" || branchFor(person) === branchFilter)
    );
  });
  const surnameRows = Object.values(
    filteredPeople
      .flatMap((person) =>
        [...new Set([person.surname, person.maidenName].filter(Boolean))].map(
          (name) => ({ name, person }),
        ),
      )
      .reduce((result, entry) => {
        const key = entry.name.toLowerCase();
        result[key] ||= { name: entry.name, people: [], places: new Set() };
        result[key].people.push(entry.person);
        if (entry.person.birthPlace) result[key].places.add(entry.person.birthPlace);
        return result;
      }, {}),
  ).sort((a, b) => b.people.length - a.people.length || a.name.localeCompare(b.name));

  const statusFor = (person) => {
    if (person.isPlaceholder) return "Needs identification";
    if (person.isIdentityOwner) return "Claimed by you";
    if (person.isClaimed) return "Claimed profile";
    if (person.confirmationCount > 0)
      return `Confirmed by ${person.confirmationCount} relative${person.confirmationCount === 1 ? "" : "s"}`;
    return "Unclaimed";
  };

  return (
    <div className="page inner-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR RECORDS</span>
          <h1>My family</h1>
          <p>People and family names you have added or that family shared with you.</p>
        </div>
        <div className="heading-actions">
          <button className="quiet" onClick={openVoice}>
            <Sparkles size={17} /> Voice entry
          </button>
          <button className="quiet" onClick={openMerge}>
            <Link2 size={17} /> Merge duplicates
          </button>
          <button className="primary" onClick={openAdd}>
            <Plus size={18} /> Add family member
          </button>
        </div>
      </div>
      <div className="toolbar family-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            placeholder="Find someone — Roman Sindhi or سنڌي"
            value={localQuery}
            onChange={(event) => setLocalQuery(event.target.value)}
          />
        </div>
        <label className="filter select-filter">
          <ListFilter size={17} />
          <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Filter family branch">
            <option value="all">All branches</option>
            {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </label>
        <div className="segmented-control" role="group" aria-label="Family list view">
          <button className={viewMode === "people" ? "active" : ""} onClick={() => setViewMode("people")}>People</button>
          <button className={viewMode === "surnames" ? "active" : ""} onClick={() => setViewMode("surnames")}>Surnames</button>
        </div>
      </div>
      {viewMode === "surnames" ? (
        <div className="surname-directory">
          {surnameRows.map((surname) => (
            <section className="panel surname-directory-card" key={surname.name}>
              <div><span className="surname-num">{surname.name[0]}</span><div><h2>{surname.name}</h2><p>{surname.people.length} people · {[...surname.places].slice(0, 3).join(" · ") || "No places recorded"}</p></div></div>
              <div className="detail-relations">
                {surname.people.map((person) => <button key={person.id} onClick={() => openPerson(person)}>{person.name}<small>{branchFor(person)}</small></button>)}
              </div>
            </section>
          ))}
          {!surnameRows.length && <div className="empty"><Search /><h3>No surnames match</h3><p>Change the search or branch filter.</p></div>}
        </div>
      ) : (
        <div className="people-grid">
          {filteredPeople.map((person) => (
            <article className={`person-card ${person.isPlaceholder ? "placeholder-card" : ""}`} key={person.id}>
              <button className="person-card-main" onClick={() => openPerson(person)}>
                <div className="person-card-top">
                  <Avatar person={person} size="large" />
                  <span className={`record-status ${person.isClaimed ? "claimed" : person.isPlaceholder ? "needs-review" : "unclaimed"}`}>
                    {person.isClaimed && <ShieldCheck size={12} />} {statusFor(person)}
                  </span>
                </div>
                <h3>{person.name}</h3>
                <p>
                  {person.isPlaceholder
                    ? "Name, dates and locations have not been identified yet."
                    : person.birthYear
                      ? `Born ${person.birthApproximate ? "circa " : ""}${person.birthYear}${person.birthPlace ? ` in ${person.birthPlace}` : ""}`
                      : "Birth year unknown"}
                </p>
                <div className="person-meta">
                  <span><GitFork size={14} /> {branchFor(person)}</span>
                  {person.maidenName && <span>née {person.maidenName}</span>}
                  {person.deathYear && <span>Died {person.deathYear}</span>}
                  {person.livedLocations.map((location) => (
                    <span key={location.residenceId || location.providerId} title={residencePeriod(location) || undefined}>
                      <MapPin size={12} /> {residenceLabel(location)}
                    </span>
                  ))}
                </div>
              </button>
              <div className="person-actions">
                {person.canEdit ? (
                  <button onClick={() => editPerson(person)}>{person.isPlaceholder ? "Fill this slot" : "Edit details"} <ArrowRight size={14} /></button>
                ) : person.canSuggest ? (
                  <button onClick={() => editPerson(person)}>Suggest correction <ArrowRight size={14} /></button>
                ) : <span>Read-only shared record</span>}
                <div>
                  {!person.isSelf && !person.linkedUserId && <button onClick={() => invitePerson(person)}><UserPlus size={13} /> Invite</button>}
                  {person.canDelete && <button className="delete-person" onClick={() => deletePerson(person)}><Trash2 size={13} /> Delete</button>}
                </div>
              </div>
            </article>
          ))}
          {!filteredPeople.length && <div className="empty"><Search /><h3>No people match</h3><p>Change the search or branch filter.</p></div>}
        </div>
      )}
    </div>
  );
}

function Tree({
  people,
  relationships,
  addRelative,
  addUnknownSiblings,
  editPerson,
  openLinkPeople,
  readOnly = false,
  initialFocusId = "",
  heading = "Your family, connected",
  description = "Tap a person to open their profile. Use + to add someone directly around them, then focus, filter or zoom the graph for large families.",
  originLabel = "me",
  relationshipOriginId = "",
}) {
  const [view, setView] = useState("traditional");
  const [degreeLimit, setDegreeLimit] = useState("2");
  const [focusId, setFocusId] = useState(initialFocusId || people.find((person) => person.isSelf)?.id || people[0]?.id || "");
  const [zoom, setZoom] = useState(1);
  const [generationFilter, setGenerationFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const releaseVerticalWheel = (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const viewport = event.currentTarget;
    const hasInternalVerticalScroll = viewport.scrollHeight > viewport.clientHeight + 2;
    if (hasInternalVerticalScroll) return;
    event.preventDefault();
    window.scrollBy({ top: event.deltaY, behavior: "auto" });
  };
  const middlePan = useRef(null);
  const startMiddlePan = (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    const viewport = event.currentTarget;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("middle-panning");
    middlePan.current = {
      viewport,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  };
  const moveMiddlePan = (event) => {
    const pan = middlePan.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    pan.viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
    pan.viewport.scrollTop = pan.scrollTop - (event.clientY - pan.y);
  };
  const stopMiddlePan = (event) => {
    const pan = middlePan.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    pan.viewport.classList.remove("middle-panning");
    if (pan.viewport.hasPointerCapture(event.pointerId)) pan.viewport.releasePointerCapture(event.pointerId);
    middlePan.current = null;
  };
  const middlePanProps = {
    onPointerDown: startMiddlePan,
    onPointerMove: moveMiddlePan,
    onPointerUp: stopMiddlePan,
    onPointerCancel: stopMiddlePan,
    onAuxClick: (event) => {
      if (event.button === 1) event.preventDefault();
    },
  };
  const traditionalCanvasRef = useRef(null);
  const traditionalUnitRefs = useRef(new Map());
  const traditionalPersonRefs = useRef(new Map());
  const [traditionalLines, setTraditionalLines] = useState({
    width: 0,
    height: 0,
    paths: [],
  });
  const selfRoot = relationshipOriginId
    ? people.find((person) => person.id === relationshipOriginId)
    : people.find((person) => person.isSelf) || people[0];
  const root = people.find((person) => person.id === focusId) || selfRoot;
  const levels = root ? { [root.id]: 0 } : {};
  for (let pass = 0; pass < people.length; pass += 1) {
    relationships.forEach((relationship) => {
      const fromLevel = levels[relationship.from];
      const toLevel = levels[relationship.to];
      const distance =
        relationship.type === "grandparent"
          ? 2
          : relationship.type === "parent"
            ? 1
            : relationship.type === "child"
              ? -1
              : 0;
      if (fromLevel !== undefined && toLevel === undefined)
        levels[relationship.to] = fromLevel + distance;
      if (toLevel !== undefined && fromLevel === undefined)
        levels[relationship.from] = toLevel - distance;
    });
  }
  people.forEach((person) => {
    levels[person.id] ??= 0;
  });
  const distances = root ? { [root.id]: 0 } : {};
  for (let pass = 0; pass < people.length; pass += 1) {
    relationships.forEach((relationship) => {
      const fromDistance = distances[relationship.from];
      const toDistance = distances[relationship.to];
      if (fromDistance !== undefined && toDistance === undefined)
        distances[relationship.to] = fromDistance + 1;
      if (toDistance !== undefined && fromDistance === undefined)
        distances[relationship.from] = toDistance + 1;
    });
  }
  const maximumDistance =
    degreeLimit === "all" ? Infinity : Number(degreeLimit);
  const branchForTree = (person) => deriveBranchLabel(person.id, selfRoot?.id, people, relationships);
  const branchOptions = [...new Set(people.map(branchForTree))].filter(Boolean).sort();
  const generationVisible = (person) => {
    const level = levels[person.id] ?? 0;
    if (generationFilter === "ancestors") return level < 0;
    if (generationFilter === "same") return level === 0;
    if (generationFilter === "descendants") return level > 0;
    return true;
  };
  const treePeople = people.filter((person) =>
    (branchFilter === "all" || branchForTree(person) === branchFilter) && generationVisible(person),
  );
  const networkPeople = treePeople.filter(
    (person) => (distances[person.id] ?? Infinity) <= maximumDistance,
  );
  const visibleIds = new Set(networkPeople.map((person) => person.id));
  const visibleRelationships = relationships.filter(
    (relationship) =>
      visibleIds.has(relationship.from) && visibleIds.has(relationship.to),
  );
  const networkGrouped = networkPeople.reduce((result, person) => {
    const level = levels[person.id];
    result[level] ||= [];
    result[level].push(person);
    return result;
  }, {});
  const networkLevelNumbers = Object.keys(networkGrouped)
    .map(Number)
    .sort((a, b) => a - b);
  const minLevel = Math.min(...networkLevelNumbers, 0);
  const maxLevel = Math.max(...networkLevelNumbers, 0);
  const positions = Object.fromEntries(
    networkLevelNumbers.flatMap((level) =>
      (networkGrouped[level] || []).map((person, index) => [
        person.id,
        [
          ((index + 1) / ((networkGrouped[level] || []).length + 1)) * 100,
          maxLevel === minLevel
            ? 50
            : 14 + ((level - minLevel) / (maxLevel - minLevel)) * 72,
        ],
      ]),
    ),
  );
  const multiPath = visibleRelationships.find((relationship, index) =>
    visibleRelationships.some(
      (other, otherIndex) =>
        index !== otherIndex &&
        ((other.from === relationship.from && other.to === relationship.to) ||
          (other.from === relationship.to && other.to === relationship.from)),
    ),
  );
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const focusPath = selfRoot && root ? shortestRelationshipPath(selfRoot.id, root.id, relationships) : [];
  const focusPathPairs = new Set(focusPath.slice(1).map((id, index) => [focusPath[index], id].sort().join(":")));
  const focusPathLabel = focusPath.length > 1
    ? focusPath.map((id) => peopleById.get(id)?.firstName || "Unknown").join(" → ")
    : root?.id === selfRoot?.id ? "This is you" : "No recorded path";
  const { rows: traditionalRows, edges: traditionalEdges } =
    buildTraditionalTreeLayout(treePeople, relationships, levels);
  const traditionalEdgesJson = JSON.stringify(traditionalEdges);
  const generationLabel = (level) => {
    if (level === 0) return "Your generation";
    if (level === -1) return "Parents";
    if (level === -2) return "Grandparents";
    if (level === 1) return "Children";
    if (level === 2) return "Grandchildren";
    return level < 0
      ? `${Math.abs(level)} generations above`
      : `${level} generations below`;
  };
  useLayoutEffect(() => {
    if (view !== "traditional" || !traditionalCanvasRef.current)
      return undefined;
    const canvas = traditionalCanvasRef.current;
    const measuredEdges = JSON.parse(traditionalEdgesJson);
    let frame;
    const updateLines = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const canvasRect = canvas.getBoundingClientRect();
        const scale = canvas.offsetWidth ? canvasRect.width / canvas.offsetWidth : 1;
        const paths = measuredEdges.flatMap((edge) => {
          const parent = edge.fromPersonId
            ? traditionalPersonRefs.current.get(edge.fromPersonId)
            : traditionalUnitRefs.current.get(edge.from);
          const child = edge.toPersonId
            ? traditionalPersonRefs.current.get(edge.toPersonId)
            : traditionalUnitRefs.current.get(edge.to);
          if (!parent || !child) return [];
          const parentRect = parent.getBoundingClientRect();
          const childRect = child.getBoundingClientRect();
          if (edge.kind === "partner") {
            const fromX =
              (parentRect.left + parentRect.width / 2 - canvasRect.left) / scale;
            const fromY =
              (parentRect.top + parentRect.height / 2 - canvasRect.top) / scale;
            const toX =
              (childRect.left + childRect.width / 2 - canvasRect.left) / scale;
            const toY =
              (childRect.top + childRect.height / 2 - canvasRect.top) / scale;
            return [
              {
                key: edge.key,
                kind: "partner",
                from: edge.from,
                to: edge.to,
                pathKeys: edge.pathKeys,
                d: `M ${fromX} ${fromY} L ${toX} ${toY}`,
              },
            ];
          }
          const fromX =
            (parentRect.left + parentRect.width / 2 - canvasRect.left) / scale;
          const fromY = (parentRect.bottom - canvasRect.top) / scale;
          const toX = (childRect.left + childRect.width / 2 - canvasRect.left) / scale;
          const toY = (childRect.top - canvasRect.top) / scale;
          const middleY = fromY + (toY - fromY) / 2;
          return [
            {
              key: edge.key,
              kind: "parent",
              from: edge.from,
              to: edge.to,
              pathKeys: edge.pathKeys,
              d: `M ${fromX} ${fromY} V ${middleY} H ${toX} V ${toY}`,
            },
          ];
        });
        setTraditionalLines({
          width: canvas.scrollWidth,
          height: canvas.scrollHeight,
          paths,
        });
      });
    };
    updateLines();
    const observer = new ResizeObserver(updateLines);
    observer.observe(canvas);
    traditionalUnitRefs.current.forEach((element) => observer.observe(element));
    traditionalPersonRefs.current.forEach((element) => observer.observe(element));
    window.addEventListener("resize", updateLines);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateLines);
    };
  }, [people, relationships, traditionalEdgesJson, view, zoom]);
  const connectionLabels = (person) => {
    const names = (ids) =>
      ids
        .map((id) => people.find((item) => item.id === id)?.firstName)
        .filter(Boolean)
        .join(" & ");
    const parents = relationships
      .filter((item) => item.type === "parent" && item.to === person.id)
      .map((item) => item.from);
    const children = relationships
      .filter((item) => item.type === "parent" && item.from === person.id)
      .map((item) => item.to);
    const siblingDetails = siblingDetailsFor(person.id, relationships);
    const fullSiblings = siblingDetails
      .filter((item) => item.kind === "full")
      .map((item) => item.id);
    const halfSiblings = siblingDetails
      .filter((item) => item.kind === "half")
      .map((item) => item.id);
    const stepSiblings = siblingDetails
      .filter((item) => item.kind === "step")
      .map((item) => item.id);
    const reportedSiblings = siblingDetails
      .filter((item) => item.kind === "reported")
      .map((item) => item.id);
    const partnerRelationships = relationships.filter(
      (item) =>
        ["spouse", "partner"].includes(item.type) &&
        (item.from === person.id || item.to === person.id),
    );
    const partners = partnerRelationships.map((item) =>
      item.from === person.id ? item.to : item.from,
    );
    const partnershipYear = partnerRelationships.find(
      (item) => item.startYear,
    )?.startYear;
    return [
      parents.length ? `Child of ${names(parents)}` : null,
      partners.length
        ? `Partner of ${names(partners)}${partnershipYear ? ` · married ${partnershipYear}` : ""}`
        : null,
      fullSiblings.length ? `Sibling of ${names(fullSiblings)}` : null,
      halfSiblings.length ? `Half-sibling of ${names(halfSiblings)}` : null,
      stepSiblings.length ? `Step-sibling of ${names(stepSiblings)}` : null,
      reportedSiblings.length
        ? `Reported sibling of ${names(reportedSiblings)}`
        : null,
      children.length ? `Parent of ${names(children)}` : null,
    ].filter(Boolean);
  };
  const renderTreePerson = (person, index, unitLength) => {
    const hasHalfSibling = siblingDetailsFor(person.id, relationships).some((item) => item.kind === "half");
    return (
    <div
      className={`traditional-person ${person.isPlaceholder ? "placeholder-person" : ""} ${focusPath.includes(person.id) ? "path-highlight" : ""}`}
      key={person.id}
      ref={(element) => {
        if (element) traditionalPersonRefs.current.set(person.id, element);
        else traditionalPersonRefs.current.delete(person.id);
      }}
    >
      <button
        type="button"
        className="tree-person-edit"
        onClick={() => !readOnly && editPerson?.(person)}
        disabled={readOnly}
        title={readOnly ? person.name : `Open ${person.name}'s profile`}
      >
        <Avatar person={person} />
        <strong>
          {person.firstName}
          {person.nickname ? ` "${person.nickname}"` : ""}
        </strong>
        <span>{person.isPlaceholder ? "Details missing" : person.surname}</span>
        <div className="traditional-connections">
          {connectionLabels(person).map((label) => (
            <small key={label}>{label}</small>
          ))}
        </div>
        {hasHalfSibling && <small className="half-sibling-badge">½ Half-sibling branch</small>}
        {!readOnly && <small className="edit-hint">Open profile</small>}
      </button>
      {!readOnly && <button
        onClick={() => addRelative(person)}
        title={`Add relative to ${person.firstName}`}
      >
        <Plus size={12} /> Add
      </button>}
      {!readOnly && !person.isPlaceholder && (
        <button
          className="unknown-action"
          onClick={() => addUnknownSiblings(person)}
        >
          ? Unknown siblings
        </button>
      )}
      {index === 0 && unitLength === 2 && <i className="couple-link" />}
    </div>
  );
  };
  const renderTraditionalUnit = (unit) => (
    <div
      className={`traditional-unit ${unit.members.length === 1 ? "single" : "couple"}`}
      key={unit.id}
      ref={(element) => {
        if (element) traditionalUnitRefs.current.set(unit.id, element);
        else traditionalUnitRefs.current.delete(unit.id);
      }}
    >
      <div className="traditional-couple">
        {unit.members.map((person, index) =>
          renderTreePerson(person, index, unit.members.length),
        )}
      </div>
    </div>
  );
  return (
    <div className="page inner-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">RELATIONSHIP MAP</span>
          <h1>{heading}</h1>
          <p>{description}</p>
        </div>
        <div className="legend">
          <span>
            <i className="parent-line" /> Parent
          </span>
          <span>
            <i className="partner-line" /> Partner
          </span>
          <span>
            <i className="cousin-line" /> Extended family
          </span>
        </div>
      </div>
      <div className="tree-view-switch" role="tablist" aria-label="Family view">
        <button
          className={view === "traditional" ? "active" : ""}
          onClick={() => setView("traditional")}
        >
          <UsersRound size={16} /> Traditional tree
        </button>
        <button
          className={view === "network" ? "active" : ""}
          onClick={() => setView("network")}
        >
          <Network size={16} /> Connection map
        </button>
      </div>
      <div className="tree-interaction-toolbar panel">
        <label>Focus on person
          <select value={root?.id || ""} onChange={(event) => setFocusId(event.target.value)}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label>Generation
          <select value={generationFilter} onChange={(event) => setGenerationFilter(event.target.value)}>
            <option value="all">All generations</option>
            <option value="ancestors">Ancestors</option>
            <option value="same">Same generation</option>
            <option value="descendants">Descendants</option>
          </select>
        </label>
        <label>Branch visibility
          <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
            <option value="all">All branches</option>
            {branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </label>
        <div className="zoom-controls" aria-label="Tree zoom controls">
          <button className="quiet" onClick={() => setZoom((value) => Math.max(.55, +(value - .15).toFixed(2)))} aria-label="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="quiet" onClick={() => setZoom((value) => Math.min(2.2, +(value + .15).toFixed(2)))} aria-label="Zoom in">+</button>
          <button className="text-button" onClick={() => setZoom(1)}>Reset</button>
        </div>
        <div className="relationship-path-summary">
          <strong>How is {root?.firstName || "this person"} related to {originLabel}?</strong>
          <span>{focusPathLabel}{focusPath.length > 1 ? ` · ${focusPath.length - 1} connection${focusPath.length === 2 ? "" : "s"}` : ""}</span>
        </div>
      </div>
      {!readOnly && <button className="link-existing-button" onClick={openLinkPeople}>
        <Link2 size={15} /> Link existing people
      </button>}
      {!readOnly && <div className="tree-help">
        <GitFork size={18} />
        <span>
          <strong>Build with familiar terms</strong>For Chacha, tap your father
          and choose Brother. For Dadi, tap your father and choose Mother. For
          Chachi, tap your uncle and choose Wife.
        </span>
      </div>}
      {view === "traditional" && (
        <section className="traditional-tree tree-pan-viewport" onWheel={releaseVerticalWheel} {...middlePanProps}>
          <div className="traditional-canvas tree-zoom-stage" ref={traditionalCanvasRef} style={{ zoom }}>
            <svg
              className="traditional-connectors"
              width={traditionalLines.width}
              height={traditionalLines.height}
              viewBox={`0 0 ${traditionalLines.width || 1} ${traditionalLines.height || 1}`}
              aria-hidden="true"
            >
              {traditionalLines.paths.map((path) => (
                <path key={path.key} d={path.d} className={`${path.kind === "partner" ? "partner-line" : ""} ${path.pathKeys?.some((key) => focusPathPairs.has(key)) ? "path-highlight-line" : ""}`} />
              ))}
            </svg>
            {traditionalRows.map((row) => (
              <div className="traditional-generation" key={row.level}>
                <span className="generation-label">
                  {generationLabel(row.level)}
                </span>
                <div className="traditional-generation-row">
                  {row.units.map(renderTraditionalUnit)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {view === "network" && (
        <>
          <div className="degree-controls">
            <div>
              <strong>Visible relationship distance</strong>
              <span>
                A direct line is always one stored relationship. The view
                defaults to two hops from you.
              </span>
            </div>
            <label>
              Show
              <select
                value={degreeLimit}
                onChange={(event) => setDegreeLimit(event.target.value)}
              >
                <option value="1">1 degree</option>
                <option value="2">2 degrees</option>
                <option value="3">3 degrees</option>
                <option value="4">4 degrees</option>
                <option value="all">All people</option>
              </select>
            </label>
          </div>
          <section className="tree-panel">
            <div className="map-label">
              <Network size={16} /> Interactive family map{" "}
              <span>Live graph</span>
            </div>
            <div className="tree-pan-viewport network-pan-viewport" {...middlePanProps}>
            <div className="family-map tree-zoom-stage" style={{ zoom }}>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {visibleRelationships.map((rel) => {
                  const a = positions[rel.from],
                    b = positions[rel.to];
                  if (!a || !b) return null;
                  return (
                    <line
                      key={rel.id}
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      className={`${
                        ["spouse", "partner"].includes(rel.type)
                          ? "spouse"
                          : rel.type.includes("cousin")
                            ? "cousin"
                            : rel.type
                      } ${focusPathPairs.has([rel.from, rel.to].sort().join(":")) ? "path-highlight-line" : ""}`}
                    />
                  );
                })}
              </svg>
              {networkPeople
                .filter((person) => positions[person.id])
                .map((person) => (
                  <div
                    className={`map-person ${person.isPlaceholder ? "placeholder-person" : ""} ${focusPath.includes(person.id) ? "path-highlight" : ""}`}
                    style={{
                      left: `${positions[person.id][0]}%`,
                      top: `${positions[person.id][1]}%`,
                    }}
                    key={person.id}
                  >
                    <button
                      type="button"
                      className="map-person-edit"
                      onClick={() => !readOnly && editPerson?.(person)}
                      disabled={readOnly}
                      title={readOnly ? person.name : `Open ${person.name}'s profile`}
                    >
                      <Avatar person={person} />
                      <strong>
                        {person.firstName}
                        {person.nickname ? ` "${person.nickname}"` : ""}
                      </strong>
                      <span>
                        {person.isPlaceholder
                          ? "Details missing"
                          : person.surname}
                      </span>
                      {siblingDetailsFor(person.id, relationships).some((item) => item.kind === "half") && <small className="half-sibling-badge">½ half-sibling</small>}
                    </button>
                    {!readOnly && <button
                      className="map-add"
                      onClick={() => addRelative(person)}
                      title={`Add a relative connected to ${person.firstName}`}
                    >
                      <Plus size={13} />
                    </button>}
                    {!readOnly && !person.isPlaceholder && (
                      <button
                        className="map-gap"
                        onClick={() => addUnknownSiblings(person)}
                        title={`Add unknown sibling slots for ${person.firstName}`}
                      >
                        ?
                      </button>
                    )}
                  </div>
                ))}
              {multiPath && (
                <div className="multi-path">
                  <GitFork size={14} />
                  <span>
                    This pair has more than one
                    <br />
                    <strong>recorded relationship</strong>
                  </span>
                </div>
              )}
            </div>
            </div>
          </section>
        </>
      )}
      <div className="map-explainer">
        <CircleHelp size={20} />
        <div>
          <strong>
            {view === "traditional"
              ? "A familiar tree backed by graph-safe data"
              : "Direct lines and degrees of connection"}
          </strong>
          <p>
            {view === "traditional"
              ? "Parents and couples connect to their children, with siblings kept together on the same branch. Underneath, every relationship remains separate so loops and multiple family paths are preserved."
              : "Every visible line is one direct recorded relationship. Degrees control how far Vansh travels from you, not whether indirect relatives are drawn as directly linked."}
          </p>
        </div>
      </div>
    </div>
  );
}

function Connections({
  matches,
  identityCandidates,
  inbox,
  familyUpdates = [],
  invitations = [],
  markFamilyUpdatesRead,
  connect,
  requestIdentity,
  dismissIdentity,
  respondInbox,
  revokeInvite,
  resendInvite,
  friendCode = "",
  friendships = [],
  requestFriend,
  respondFriend,
  cancelFriend,
  removeFriend,
  setFriendSharing,
  viewFriendTree,
  rotateFriendCode,
}) {
  const [reviewingFamily, setReviewingFamily] = useState(null);
  const [reviewingIdentity, setReviewingIdentity] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const reviewDialogRef = useDialogAccessibility(() => { setReviewingIdentity(null); setReviewingFamily(null); }, Boolean(reviewingIdentity || reviewingFamily));
  const incoming = inbox.filter(
    (item) => item.direction === "incoming" && item.status === "pending",
  );
  const activity = inbox.filter(
    (item) => !(item.direction === "incoming" && item.status === "pending"),
  );
  const pendingFriends = friendships.filter((item) => item.status === "pending");
  const acceptedFriends = friendships.filter((item) => item.status === "accepted");

  const act = async (id, action) => {
    setBusyId(id);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="page inner-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">TRUST & CONNECTIONS</span>
          <h1>Connections</h1>
          <p>
            Invitations, identity verification and family matches are separate.
            Nothing links automatically.
          </p>
        </div>
      </div>

      {error && <div className="auth-message">{error}</div>}

      <section className="connection-section friends-section">
        <div className="subsection-heading">
          <div>
            <span className="mini-title">FRIENDS</span>
            <h2>Connect without merging family trees</h2>
            <p>Share this exact code privately. Friendship and tree sharing are separate decisions.</p>
          </div>
        </div>
        <div className="friend-code-grid">
          <div className="panel friend-code-card">
            <strong>Your private friend code</strong>
            <code>{friendCode || "Loading..."}</code>
            <div className="request-actions">
              <button type="button" className="quiet" disabled={!friendCode} onClick={() => navigator.clipboard.writeText(friendCode)}>Copy code</button>
              <button type="button" className="text-button" disabled={Boolean(busyId)} onClick={() => act("rotate-friend-code", rotateFriendCode)}>Rotate code</button>
            </div>
          </div>
          <form className="panel friend-add-form" onSubmit={(event) => {
            event.preventDefault();
            act("add-friend", async () => {
              await requestFriend(friendCodeInput.trim());
              setFriendCodeInput("");
            });
          }}>
            <label htmlFor="friend-code-input">Add a friend by their exact code</label>
            <input id="friend-code-input" required value={friendCodeInput} onChange={(event) => setFriendCodeInput(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
            <button className="primary" disabled={busyId === "add-friend"}>
              {busyId === "add-friend" ? <LoaderCircle className="spin" size={15} /> : <UserPlus size={15} />} Send request
            </button>
          </form>
        </div>
        {pendingFriends.length > 0 && (
          <div className="request-list friend-request-list">
            {pendingFriends.map((item) => (
              <article className="request-card slim" key={item.friendship_id}>
                <div><strong>{item.counterpart_name}</strong><span>{item.direction === "incoming" ? "Wants to be friends" : "Friend request sent"}</span></div>
                <div className="request-actions">
                  {item.direction === "incoming" ? <>
                    <button className="quiet" disabled={busyId === item.friendship_id} onClick={() => act(item.friendship_id, () => respondFriend(item, false))}>Decline</button>
                    <button className="primary" disabled={busyId === item.friendship_id} onClick={() => act(item.friendship_id, () => respondFriend(item, true))}>Accept</button>
                  </> : <button className="quiet" disabled={busyId === item.friendship_id} onClick={() => act(item.friendship_id, () => cancelFriend(item))}>Cancel</button>}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="friend-list">
          {acceptedFriends.map((item) => (
            <article className="panel friend-card" key={item.friendship_id}>
              <div><Avatar person={{ name: item.counterpart_name, initials: item.counterpart_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase(), color: "teal" }} /><div><h3>{item.counterpart_name}</h3><span>{item.their_tree_shared ? "Shared their tree with you" : "Tree remains private"}</span></div></div>
              <label className="friend-share-toggle"><input type="checkbox" checked={item.my_tree_shared} disabled={busyId === item.friendship_id} onChange={(event) => act(item.friendship_id, () => setFriendSharing(item, event.target.checked))} /> Share my tree</label>
              <div className="request-actions">
                <button className="primary" disabled={!item.can_view_their_tree || busyId === item.friendship_id} onClick={() => act(item.friendship_id, () => viewFriendTree(item))}>View shared tree</button>
                <button className="text-button danger-text" disabled={busyId === item.friendship_id} onClick={() => {
                  if (window.confirm(`Remove ${item.counterpart_name} from your friends?`)) act(item.friendship_id, () => removeFriend(item));
                }}>Remove</button>
              </div>
            </article>
          ))}
        </div>
        {!pendingFriends.length && !acceptedFriends.length && <div className="panel empty compact-empty"><HeartHandshake size={24} /><h3>No friends yet</h3><p>Exchange private codes with someone you know to connect.</p></div>}
      </section>

      <section className="connection-section">
        <div className="subsection-heading">
          <div>
            <span className="mini-title">VERIFICATION INBOX</span>
            <h2>Requests needing your decision</h2>
          </div>
          {incoming.length > 0 && <strong>{incoming.length} pending</strong>}
        </div>
        {incoming.length ? (
          <div className="request-list">
            {incoming.map((item) => (
              <article className="request-card" key={`${item.kind}-${item.request_id}`}>
                <div>
                  <span className={`request-kind ${item.kind}`}>
                    {item.kind === "identity"
                      ? "Identity claim"
                      : item.kind === "invitation"
                        ? "Family invitation"
                        : item.kind === "correction"
                          ? "Correction suggestion"
                          : "Family connection"}
                  </span>
                  <h3>
                    {item.kind === "identity"
                      ? `${item.counterpart_name} says this record may be them`
                      : item.kind === "invitation"
                        ? `${item.counterpart_name} invited you`
                        : item.kind === "correction"
                          ? `${item.counterpart_name} suggested a change`
                          : `${item.counterpart_name} wants to connect families`}
                  </h3>
                  {item.subject_name && <p>Record: {item.subject_name}</p>}
                  <div className="why compact">
                    {(item.shared_details || []).map((detail) => (
                      <span key={detail}>
                        <Check size={13} /> {detail}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="request-actions">
                  <button
                    className="quiet"
                    disabled={busyId === item.request_id}
                    onClick={() =>
                      act(item.request_id, () =>
                        respondInbox(item, false),
                      )
                    }
                  >
                    Reject
                  </button>
                  <button
                    className="primary"
                    disabled={busyId === item.request_id}
                    onClick={() =>
                      act(item.request_id, () =>
                        respondInbox(item, true),
                      )
                    }
                  >
                    {busyId === item.request_id ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Check size={15} />
                    )}{" "}
                    Accept
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel empty compact-empty">
            <ShieldCheck size={24} />
            <h3>No decisions waiting</h3>
            <p>New claims, invitations and corrections will appear here.</p>
          </div>
        )}
      </section>

      <section className="connection-section">
        <div className="subsection-heading">
          <div>
            <span className="mini-title">FAMILY TREE UPDATES</span>
            <h2>Changes made by relatives</h2>
            <p>When someone who shares this tree adds or changes family information, the update appears here.</p>
          </div>
          {familyUpdates.some((item) => !item.read_at) && (
            <button type="button" className="quiet" onClick={markFamilyUpdatesRead}>Mark all read</button>
          )}
        </div>
        {familyUpdates.length ? (
          <div className="request-list">
            {familyUpdates.slice(0, 30).map((item) => (
              <article className={`request-card slim family-update ${item.read_at ? "" : "unread"}`} key={item.notification_id}>
                <div>
                  <strong>{item.actor_name || "A relative"}</strong>
                  <span>{item.summary}</span>
                  <small>{new Date(item.created_at).toLocaleString()}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel empty compact-empty"><Bell size={22} /><h3>No family updates yet</h3><p>Edits from relatives who share your tree will appear here.</p></div>
        )}
      </section>

      <section className="connection-section">
        <div className="subsection-heading">
          <div>
            <span className="mini-title">INVITATION MANAGEMENT</span>
            <h2>Invitations you have sent</h2>
            <p>Pending invitations can be resent or revoked. Invitations expire automatically.</p>
          </div>
        </div>
        {invitations.filter((item) => item.direction === "outgoing").length ? (
          <div className="request-list">
            {invitations.filter((item) => item.direction === "outgoing").map((item) => (
              <article className="request-card slim invitation-activity" key={item.invitation_id}>
                <div>
                  <strong>{item.person_name}</strong>
                  <span>{item.email} · {item.scope} · {item.status}</span>
                  <small>Sent {new Date(item.created_at).toLocaleDateString()} · expires {new Date(item.expires_at).toLocaleDateString()}</small>
                </div>
                <div className="request-actions">
                  {["pending", "expired"].includes(item.status) && (
                    <button className="quiet" disabled={busyId === item.invitation_id} onClick={() => act(item.invitation_id, () => resendInvite(item))}>Resend</button>
                  )}
                  {item.status === "pending" && (
                    <button className="quiet danger-text" disabled={busyId === item.invitation_id} onClick={() => act(item.invitation_id, () => revokeInvite(item))}>Revoke</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel empty compact-empty"><Mail size={22} /><h3>No invitations sent yet</h3><p>Invite an unclaimed family member from their person profile.</p></div>
        )}
      </section>

      <section className="connection-section">
        <div className="subsection-heading">
          <div>
            <span className="mini-title">IDENTITY SUGGESTIONS</span>
            <h2>Could an existing record be you?</h2>
            <p>
              A match is only a suggestion. Requesting a claim still requires
              the original record creator to approve it.
            </p>
          </div>
        </div>
        <div className="connection-grid">
          {identityCandidates.map((candidate) => (
            <article className="connection-card identity-card" key={candidate.id}>
              <div className="score-ring">
                <strong>{candidate.score}</strong>
                <span>match score</span>
              </div>
              <Avatar person={candidate} size="large" />
              <h2>{candidate.name}</h2>
              <p>{candidate.details}</p>
              <span className="relation-label">
                <ShieldCheck size={15} /> {candidate.personCode}
              </span>
              <div className="why">
                <strong>Why Vansh suggested this</strong>
                {candidate.shared.map((item) => (
                  <span key={item}>
                    <Check size={13} /> {item}
                  </span>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => setReviewingIdentity(candidate)}
              >
                Review identity suggestion
              </button>
            </article>
          ))}
        </div>
        {!identityCandidates.length && (
          <div className="panel empty compact-empty">
            <ShieldCheck size={24} />
            <h3>No identity suggestions</h3>
            <p>Vansh has not found a sufficiently strong candidate for you.</p>
          </div>
        )}
      </section>

      <section className="connection-section">
        <div className="subsection-heading">
          <div>
            <span className="mini-title">FAMILY MATCHES</span>
            <h2>Possible overlapping family branches</h2>
            <p>
              These are family-to-family suggestions, not claims that two
              people are the same person.
            </p>
          </div>
        </div>
        <div className="privacy-banner">
          <LockKeyhole size={22} />
          <div>
            <strong>Private by default</strong>
            <p>
              Only broad matching clues are shown until both families choose to
              connect.
            </p>
          </div>
        </div>
        <div className="connection-grid">
          {matches.map((match) => (
            <article className="connection-card" key={match.id}>
              <div className="score-ring">
                <strong>{match.score}</strong>
                <span>match score</span>
              </div>
              <Avatar person={match} size="large" />
              <h2>{match.name}</h2>
              <p>{match.details}</p>
              <span className="relation-label">
                <GitFork size={15} /> Possible branch overlap
              </span>
              <div className="why">
                <strong>Shared clues</strong>
                {match.shared.map((item) => (
                  <span key={item}>
                    <Check size={13} /> {item}
                  </span>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => setReviewingFamily(match)}
              >
                Review family match
              </button>
            </article>
          ))}
        </div>
        {!matches.length && (
          <div className="panel empty compact-empty">
            <Sparkles size={24} />
            <h3>No family matches yet</h3>
            <p>Add more surnames and places to improve branch matching.</p>
          </div>
        )}
      </section>

      {activity.length > 0 && (
        <section className="connection-section">
          <div className="subsection-heading">
            <div>
              <span className="mini-title">ACTIVITY</span>
              <h2>Previous and outgoing requests</h2>
            </div>
          </div>
          <div className="request-list">
            {activity.slice(0, 20).map((item) => (
              <article className="request-card slim" key={`${item.kind}-${item.request_id}`}>
                <div>
                  <strong>{item.counterpart_name}</strong>
                  <span>
                    {item.kind.replaceAll("_", " ")} · {item.direction} ·{" "}
                    {item.status}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {reviewingIdentity && (
        <div className="modal-wrap">
          <button className="modal-scrim" onClick={() => setReviewingIdentity(null)} />
          <div ref={reviewDialogRef} className="review-modal" role="dialog" aria-modal="true" aria-label="Review connection request" tabIndex={-1}>
            <button className="modal-close" onClick={() => setReviewingIdentity(null)}>
              <X />
            </button>
            <span className="mini-title">
              <ShieldCheck size={14} /> IDENTITY REVIEW
            </span>
            <Avatar person={reviewingIdentity} size="large" />
            <h2>Is this record you?</h2>
            <p>
              Requesting a claim does not link anything yet. The family member
              who created this record must separately approve.
            </p>
            <div className="review-reasons">
              {reviewingIdentity.shared.map((item) => (
                <span key={item}>
                  <Check size={15} /> {item}
                </span>
              ))}
            </div>
            <button
              className="primary"
              disabled={busyId === reviewingIdentity.id}
              onClick={() =>
                act(reviewingIdentity.id, async () => {
                  await requestIdentity(reviewingIdentity);
                  setReviewingIdentity(null);
                })
              }
            >
              <ShieldCheck size={17} /> Yes, request to claim this record
            </button>
            <button
              className="quiet"
              disabled={busyId === reviewingIdentity.id}
              onClick={() =>
                act(reviewingIdentity.id, async () => {
                  await dismissIdentity(reviewingIdentity);
                  setReviewingIdentity(null);
                })
              }
            >
              No, this is not me
            </button>
          </div>
        </div>
      )}

      {reviewingFamily && (
        <div className="modal-wrap">
          <button className="modal-scrim" onClick={() => setReviewingFamily(null)} />
          <div ref={reviewDialogRef} className="review-modal" role="dialog" aria-modal="true" aria-label="Review connection request" tabIndex={-1}>
            <button className="modal-close" onClick={() => setReviewingFamily(null)}>
              <X />
            </button>
            <span className="mini-title">
              <ShieldCheck size={14} /> FAMILY MATCH REVIEW
            </span>
            <Avatar person={reviewingFamily} size="large" />
            <h2>Could these family branches overlap?</h2>
            <p>
              This sends a family connection request. It does not merge records
              and does not establish anyone&apos;s identity.
            </p>
            <div className="review-reasons">
              {reviewingFamily.shared.map((item) => (
                <span key={item}>
                  <Check size={15} /> {item}
                </span>
              ))}
            </div>
            <button
              className="primary"
              disabled={busyId === reviewingFamily.id}
              onClick={() =>
                act(reviewingFamily.id, async () => {
                  await connect(reviewingFamily, "requested");
                  setReviewingFamily(null);
                })
              }
            >
              <HeartHandshake size={17} /> Send family connection request
            </button>
            <button
              className="quiet"
              disabled={busyId === reviewingFamily.id}
              onClick={() =>
                act(reviewingFamily.id, async () => {
                  await connect(reviewingFamily, "dismissed");
                  setReviewingFamily(null);
                })
              }
            >
              Not a family match
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SharedFriendTreeModal({ tree, close }) {
  return (
    <AccessibleModal close={close} className="shared-tree-modal" label={`${tree.ownerName}'s shared family tree`}>
        <button className="modal-close" onClick={close} aria-label="Close shared tree"><X /></button>
        <Tree
          people={tree.people}
          relationships={tree.relationships}
          readOnly
          initialFocusId={tree.ownerMemberId}
          relationshipOriginId={tree.viewerMemberId || "not-recorded-in-this-tree"}
          originLabel="your recorded profile"
          heading={`${tree.ownerName}'s shared tree`}
          description="This is a privacy-filtered, read-only view. Private people and sensitive dates, places, identity fields, and evidence are not included."
        />
    </AccessibleModal>
  );
}


function IdentitySuggestionPrompt({ candidate, close, requestIdentity, dismissIdentity }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!candidate) return null;
  const act = async (kind) => {
    setBusy(kind);
    setError("");
    try {
      if (kind === "claim") await requestIdentity(candidate);
      else await dismissIdentity(candidate);
      close();
    } catch (actionError) {
      setError(actionError.message || "Could not update this identity suggestion.");
      setBusy("");
    }
  };
  return (
    <AccessibleModal close={close} className="review-modal identity-first-run-modal" label="Possible identity match">
      <button className="modal-close" onClick={close} aria-label="Close identity suggestion"><X /></button>
      <span className="mini-title"><ShieldCheck size={14} /> POSSIBLE IDENTITY MATCH</span>
      <Avatar person={candidate} size="large" />
      <h2>Could this existing family record be you?</h2>
      <p>
        Vansh found a strong combination of matching details. Nothing is linked automatically. If you say this is you, the record owner must separately approve the claim.
      </p>
      <div className="review-reasons">
        {(candidate.shared || []).map((item) => <span key={item}><Check size={15} /> {item}</span>)}
      </div>
      <div className="identity-prompt-summary">
        <strong>{candidate.name}</strong>
        <span>{candidate.details}</span>
        <small>{candidate.personCode} · match score {candidate.score}</small>
      </div>
      {error && <div className="auth-message">{error}</div>}
      <button className="primary" disabled={Boolean(busy)} onClick={() => act("claim")}>
        {busy === "claim" ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} Yes, this is me — request verification
      </button>
      <button className="quiet" disabled={Boolean(busy)} onClick={() => act("dismiss")}>No, this is not me</button>
      <button className="text-button" disabled={Boolean(busy)} onClick={close}>Review later in Connections</button>
    </AccessibleModal>
  );
}

function InviteModal({ person, close, onSent }) {
  const dialogRef = useDialogAccessibility(close);
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState("connection");
  const [previews, setPreviews] = useState({ connection: [], immediate: [], extended: [] });
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc("preview_family_invitation_people", { p_person_id: person.id, p_scope: "connection" }),
      supabase.rpc("preview_family_invitation_people", { p_person_id: person.id, p_scope: "immediate" }),
      supabase.rpc("preview_family_invitation_people", { p_person_id: person.id, p_scope: "extended" }),
    ]).then(([connection, immediate, extended]) => {
      if (active)
        setPreviews({
          connection: connection.data || [],
          immediate: immediate.data || [],
          extended: extended.data || [],
        });
    });
    return () => {
      active = false;
    };
  }, [person.id]);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    const { data, error: inviteError } = await supabase.functions.invoke(
      "send-family-invite",
      { body: { personId: person.id, email, scope } },
    );
    if (inviteError || data?.error) {
      let message =
        data?.error || inviteError?.message || "Could not send invitation.";
      if (inviteError?.context?.json) {
        try {
          message = (await inviteError.context.json()).error || message;
        } catch {
          /* Response body may already be consumed. */
        }
      }
      setError(message);
      setSending(false);
      return;
    }
    setSent(data);
    onSent?.();
    setSending(false);
  };

  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <form ref={dialogRef} className="add-modal invite-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={`Invite ${person.name}`} tabIndex={-1}>
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="mini-title">
          <UserPlus size={15} /> LIVE FAMILY INVITATION
        </span>
        {sent ? (
          <div className="invite-success">
            <div>
              <Check size={24} />
            </div>
            <h2>Invitation sent</h2>
            <p>
              When {person.firstName} signs in with <strong>{email}</strong>,
              Vansh will show this invitation in their verification inbox. Only
              after they accept will this record and {sent.sharedPeople} connected{" "}
              {sent.sharedPeople === 1 ? "person" : "people"} become available.
            </p>
            <button type="button" className="primary" onClick={close}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h2>Invite {person.firstName} to Vansh</h2>
            <p>
              This is a direct invitation for a person you already know. They
              must explicitly accept before their account is linked to this
              record or any shared family scope becomes visible.
            </p>
            <label className="auth-label">
              Their email address
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="family@example.com"
              />
            </label>
            <fieldset className="scope-options">
              <legend>Choose what they can see</legend>
              <label className={scope === "connection" ? "selected" : ""}>
                <input
                  type="radio"
                  name="scope"
                  value="connection"
                  checked={scope === "connection"}
                  onChange={() => setScope("connection")}
                />
                <span>
                  <strong>How we are connected · Recommended</strong>
                  <small>
                    Shares only {person.firstName}&apos;s invited record ({previews.connection.length || "…"} person).
                  </small>
                </span>
              </label>
              <label className={scope === "immediate" ? "selected" : ""}>
                <input
                  type="radio"
                  name="scope"
                  value="immediate"
                  checked={scope === "immediate"}
                  onChange={() => setScope("immediate")}
                />
                <span>
                  <strong>Immediate family</strong>
                  <small>
                    Shares {previews.immediate.length || "…"} people within one recorded relationship of {person.firstName}.
                  </small>
                </span>
              </label>
              <label className={scope === "extended" ? "selected" : ""}>
                <input
                  type="radio"
                  name="scope"
                  value="extended"
                  checked={scope === "extended"}
                  onChange={() => setScope("extended")}
                />
                <span>
                  <strong>Extended family</strong>
                  <small>
                    Shares {previews.extended.length || "…"} people within two recorded relationship steps, including partner branches.
                  </small>
                </span>
              </label>
            </fieldset>
            <button type="button" className="quiet preview-shared-button" onClick={() => setShowPreview((value) => !value)}>
              <UsersRound size={15} /> {showPreview ? "Hide shared people" : "Preview shared people"}
            </button>
            {showPreview && (
              <div className="shared-people-preview">
                <strong>{previews[scope].length} people will be visible</strong>
                {previews[scope].map((item) => (
                  <span key={item.member_id}><Check size={12} /> {item.display_name}<small>{item.relationship_hint}</small></span>
                ))}
              </div>
            )}
            <div className="invite-notice">
              <ShieldCheck size={17} />
              <span>
                <strong>Live, controlled sharing</strong>They can update their
                own claimed profile and records they add. Your other records
                remain synchronized but protected.
              </span>
            </div>
            {error && <div className="auth-message">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="quiet" onClick={close}>
                Cancel
              </button>
              <button className="primary" disabled={sending}>
                {sending ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Sending
                  </>
                ) : (
                  <>
                    <Send size={16} /> Send invitation
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function PlaceholderModal({
  anchor,
  existingSiblingCount,
  close,
  addPlaceholders,
}) {
  const dialogRef = useDialogAccessibility(close);
  const [count, setCount] = useState(Math.max(1, existingSiblingCount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const missingCount = Math.max(0, count - existingSiblingCount);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await addPlaceholders(anchor, count);
      close();
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <form ref={dialogRef} className="review-modal placeholder-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add unknown sibling placeholders" tabIndex={-1}>
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="mini-title">
          <CircleHelp size={15} /> RECORD WHAT IS MISSING
        </span>
        <div className="placeholder-symbol">?</div>
        <h2>Unknown siblings of {anchor.firstName}</h2>
        <p>
          Choose the total number of siblings, including people already in the
          tree. Vansh only adds the missing slots.
        </p>
        <label className="auth-label">
          Total number of siblings
          <select
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          >
            {Array.from(
              {
                length:
                  Math.max(8, existingSiblingCount + 4) -
                  existingSiblingCount +
                  1,
              },
              (_, index) => existingSiblingCount + index,
            ).map((number) => (
              <option value={number} key={number}>
                {number}
              </option>
            ))}
          </select>
        </label>
        <small className="placeholder-count-note">
          {existingSiblingCount
            ? `${existingSiblingCount} ${existingSiblingCount === 1 ? "sibling is" : "siblings are"} already recorded. Choosing ${count} will add ${missingCount} missing ${missingCount === 1 ? "slot" : "slots"}.`
            : `Choosing ${count} will add ${missingCount} missing ${missingCount === 1 ? "slot" : "slots"}.`}
        </small>
        <div className="invite-notice">
          <GitFork size={17} />
          <span>
            <strong>No assumptions are made</strong>
            Gender, names, dates and locations stay empty until someone adds
            evidence.
          </span>
        </div>
        {error && <div className="auth-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving || missingCount === 0}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Plus size={16} />
            )}
            {missingCount
              ? `Add ${missingCount} missing ${missingCount === 1 ? "slot" : "slots"}`
              : "All siblings recorded"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LinkPeopleModal({ people, relationships, close, linkPeople }) {
  const dialogRef = useDialogAccessibility(close);
  const firstPerson =
    people.find((person) => !person.isPlaceholder) || people[0];
  const [personAId, setPersonAId] = useState(firstPerson?.id || "");
  const availablePeople = people.filter(
    (person) =>
      person.id !== personAId &&
      person.ownerId === people.find((item) => item.id === personAId)?.ownerId,
  );
  const [personBId, setPersonBId] = useState(availablePeople[0]?.id || "");
  const [relation, setRelation] = useState("parent-a");
  const [marriageYear, setMarriageYear] = useState("");
  const [variant, setVariant] = useState("biological");
  const [confidence, setConfidence] = useState("reported");
  const [provenanceNote, setProvenanceNote] = useState("");
  const [sharedParentIds, setSharedParentIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const personA = people.find((person) => person.id === personAId);
  const personB = people.find((person) => person.id === personBId);
  const knownParentIds = [
    ...new Set([
      ...parentIdsFor(personAId, relationships),
      ...parentIdsFor(personBId, relationships),
    ]),
  ];

  const changeFirstPerson = (event) => {
    const nextId = event.target.value;
    const nextPerson = people.find((person) => person.id === nextId);
    const nextAvailable = people.filter(
      (person) =>
        person.id !== nextId && person.ownerId === nextPerson?.ownerId,
    );
    setPersonAId(nextId);
    setPersonBId(nextAvailable[0]?.id || "");
    setSharedParentIds([]);
  };

  const changeRelation = (event) => {
    const value = event.target.value;
    setRelation(value);
    setSharedParentIds([]);
    setMarriageYear("");
    setVariant(
      value === "parent-a" || value === "parent-b"
        ? "biological"
        : ["spouse", "partner"].includes(value)
          ? "current"
          : "reported",
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await linkPeople(
        personA,
        personB,
        relation,
        marriageYear,
        variant,
        sharedParentIds,
        confidence,
        provenanceNote,
      );
      close();
    } catch (linkError) {
      setError(linkError.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <form ref={dialogRef} className="add-modal link-people-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Link existing family members" tabIndex={-1}>
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="mini-title">
          <Link2 size={15} /> LINK EXISTING PEOPLE
        </span>
        <h2>Add a missing relationship</h2>
        <p>
          Record the direct fact. Parent variants and partnership status remain
          attached to the relationship, not to the person.
        </p>
        <div className="form-grid">
          <label>
            First person
            <select value={personAId} onChange={changeFirstPerson}>
              {people.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Second person
            <select
              required
              value={personBId}
              onChange={(event) => {
                setPersonBId(event.target.value);
                setSharedParentIds([]);
              }}
            >
              {availablePeople.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Direct relationship
            <select value={relation} onChange={changeRelation}>
              <option value="parent-a">
                {personA?.firstName || "First person"} is parent of{" "}
                {personB?.firstName || "second person"}
              </option>
              <option value="parent-b">
                {personB?.firstName || "Second person"} is parent of{" "}
                {personA?.firstName || "first person"}
              </option>
              <option value="sibling">They are siblings</option>
              <option value="spouse">They are married / spouses</option>
              <option value="partner">They are partners</option>
            </select>
          </label>

          {(relation === "parent-a" || relation === "parent-b") && (
            <label className="wide">
              Parent relationship type
              <select value={variant} onChange={(event) => setVariant(event.target.value)}>
                <option value="biological">Biological parent</option>
                <option value="adoptive">Adoptive parent</option>
                <option value="step">Step-parent</option>
                <option value="guardian">Guardian / social parent</option>
                <option value="unspecified">Not specified</option>
              </select>
            </label>
          )}

          {relation === "sibling" && knownParentIds.length > 0 && (
            <fieldset className="suggested-links wide">
              <legend>Which parent(s) do they share?</legend>
              <p>
                One selected parent records a half-sibling relationship. Two or
                more selected parents records a full sibling relationship.
              </p>
              {knownParentIds.map((parentId) => {
                const parent = people.find((person) => person.id === parentId);
                return (
                  <label key={parentId}>
                    <input
                      type="checkbox"
                      checked={sharedParentIds.includes(parentId)}
                      onChange={() =>
                        setSharedParentIds((current) =>
                          current.includes(parentId)
                            ? current.filter((id) => id !== parentId)
                            : [...current, parentId],
                        )
                      }
                    />
                    <span>
                      <strong>{parent?.name || "Known parent"}</strong>
                      <small>Shared parent</small>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {["spouse", "partner"].includes(relation) && (
            <>
              <label>
                Year {relation === "spouse" ? "married" : "partnership began"}{" "}
                <small>Optional</small>
                <input
                  inputMode="numeric"
                  value={marriageYear}
                  onChange={(event) => setMarriageYear(event.target.value)}
                  placeholder="e.g. 1968"
                />
              </label>
              <label>
                Relationship status
                <select value={variant} onChange={(event) => setVariant(event.target.value)}>
                  <option value="current">Current</option>
                  <option value="former">Former</option>
                  <option value="unspecified">Not specified</option>
                </select>
              </label>
            </>
          )}
          <label>
            Confidence
            <select value={confidence} onChange={(event) => setConfidence(event.target.value)}>
              <option value="reported">Reported</option>
              <option value="probable">Probable</option>
              <option value="uncertain">Uncertain</option>
              <option value="documented">Documented</option>
              <option value="disputed">Disputed</option>
            </select>
          </label>
          <label className="wide">
            Relationship source <small>Optional</small>
            <input value={provenanceNote} maxLength={1000} onChange={(event) => setProvenanceNote(event.target.value)} />
          </label>
        </div>
        {relation === "sibling" && !knownParentIds.length && (
          <div className="invite-notice">
            <CircleHelp size={17} />
            <span>
              <strong>Parents are not known yet</strong>
              Vansh will store this as a reported sibling relationship. Once
              parent links are added, full/half sibling status is derived from
              shared parents.
            </span>
          </div>
        )}
        {error && <div className="auth-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving || !personBId}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Link2 size={16} />
            )}{" "}
            Link people
          </button>
        </div>
      </form>
    </div>
  );
}

function MergePeopleModal({ people, close, mergePeople }) {
  const dialogRef = useDialogAccessibility(close);
  const eligible = people.filter(
    (person) =>
      !person.isPlaceholder &&
      !person.isClaimed &&
      !person.isSelf &&
      person.canEdit,
  );
  const [keepId, setKeepId] = useState(eligible[0]?.id || "");
  const keep = people.find((person) => person.id === keepId);
  const mergeOptions = eligible.filter(
    (person) => person.id !== keepId && person.ownerId === keep?.ownerId,
  );
  const [mergeId, setMergeId] = useState(mergeOptions[0]?.id || "");
  const merge = people.find((person) => person.id === mergeId);
  const [choices, setChoices] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changeKeep = (event) => {
    const nextId = event.target.value;
    const nextKeep = people.find((person) => person.id === nextId);
    const nextMerge = eligible.find(
      (person) => person.id !== nextId && person.ownerId === nextKeep?.ownerId,
    );
    setKeepId(nextId);
    setMergeId(nextMerge?.id || "");
    setChoices({});
  };

  const fields = keep && merge
    ? [
        ["first_name", "First name", keep.firstName, merge.firstName],
        ["surname", "Surname", keep.surname, merge.surname],
        ["nickname", "Nickname", keep.nickname, merge.nickname],
        ["maiden_name", "Earlier surname", keep.maidenName, merge.maidenName],
        ["gender", "Gender", keep.gender, merge.gender],
        ["birth_date", "Date of birth", keep.birthDate, merge.birthDate],
        ["birth_year", "Birth year", keep.birthYear, merge.birthYear],
        ["birth_place", "Birth place", keep.birthPlace, merge.birthPlace],
        ["lived_in", "Residence", keep.livedIn, merge.livedIn],
      ]
    : [];

  const submit = async (event) => {
    event.preventDefault();
    if (!keep || !merge) return;
    if (
      !window.confirm(
        `Merge ${merge.name} into ${keep.name}? The duplicate record will be removed after its relationships are transferred.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await mergePeople(keep.id, merge.id, choices);
      close();
    } catch (mergeError) {
      setError(mergeError.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <form ref={dialogRef} className="add-modal merge-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Merge duplicate family records" tabIndex={-1}>
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="mini-title">
          <Link2 size={15} /> DUPLICATE MERGE
        </span>
        <h2>Merge two unclaimed records</h2>
        <p>
          Choose the record to keep. Vansh transfers relationships and only
          removes the duplicate after you review conflicting values.
        </p>

        {eligible.length < 2 ? (
          <div className="privacy-banner">
            <ShieldCheck size={20} />
            <div>
              <strong>No mergeable pair</strong>
              <p>
                Claimed profiles are deliberately excluded from automatic
                merges.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="form-grid">
              <label>
                Keep this record
                <select value={keepId} onChange={changeKeep}>
                  {eligible.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Merge this duplicate into it
                <select
                  value={mergeId}
                  onChange={(event) => {
                    setMergeId(event.target.value);
                    setChoices({});
                  }}
                >
                  {mergeOptions.map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {keep && merge && (
              <div className="merge-comparison">
                <div className="merge-head">
                  <strong>Field</strong>
                  <strong>Keep: {keep.name}</strong>
                  <strong>Duplicate: {merge.name}</strong>
                </div>
                {fields.map(([key, label, keepValue, mergeValue]) => {
                  const differs =
                    String(keepValue || "") !== String(mergeValue || "");
                  return (
                    <div
                      className={`merge-field ${differs ? "conflict" : ""}`}
                      key={key}
                    >
                      <span>{label}</span>
                      <label>
                        <input
                          type="radio"
                          name={`merge-${key}`}
                          checked={(choices[key] || "keep") === "keep"}
                          onChange={() =>
                            setChoices((current) => ({
                              ...current,
                              [key]: "keep",
                            }))
                          }
                        />
                        {keepValue || "—"}
                      </label>
                      <label>
                        <input
                          type="radio"
                          name={`merge-${key}`}
                          checked={choices[key] === "merge"}
                          onChange={() =>
                            setChoices((current) => ({
                              ...current,
                              [key]: "merge",
                            }))
                          }
                        />
                        {mergeValue || "—"}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="invite-notice">
              <ShieldCheck size={17} />
              <span>
                <strong>No silent merge</strong>
                Claimed profiles cannot be merged here. Their identity link must
                be resolved explicitly.
              </span>
            </div>
          </>
        )}

        {error && <div className="auth-message">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={saving || !keep || !merge || eligible.length < 2}
          >
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Link2 size={16} />
            )}{" "}
            Merge records
          </button>
        </div>
      </form>
    </div>
  );
}

function PersonModal({
  close,
  savePerson,
  people,
  relationships,
  anchor = null,
  person = null,
  draft = null,
  initialStep = 1,
}) {
  const dialogRef = useDialogAccessibility(close);
  const initialAnchor =
    anchor || people.find((item) => item.isSelf) || people[0] || null;
  const partnerLinksFor = (personId) =>
    relationships
      .filter(
        (item) =>
          ["spouse", "partner"].includes(item.type) &&
          (item.from === personId || item.to === personId),
      )
      .map((item) => ({
        key: item.id,
        relationshipId: item.id,
        mode: "existing",
        personId: item.from === personId ? item.to : item.from,
        type: item.type,
        variant: item.status || (item.endYear ? "former" : "unspecified"),
        startYear: item.startYear?.toString() || "",
        endYear: item.endYear?.toString() || "",
        confidence: item.confidence || "reported",
        provenanceNote: item.provenanceNote || "",
        placeholderLabel: "",
        placeholderGender: "unspecified",
        alsoParentOfAnchor: false,
      }));
  const suggestedParentLinks = (anchorId, relationValue) => {
    const relation = RELATION_OPTIONS.find((option) => option.value === relationValue);
    const anchorParents = relationships
      .filter((item) => item.type === "parent" && item.to === anchorId)
      .map((item) => ({
        key: `suggested-${item.id}`,
        relationshipId: null,
        mode: "existing",
        personId: item.from,
        variant: item.variant || "biological",
        confidence: item.confidence || "reported",
        provenanceNote: item.provenanceNote || "",
      }));
    if (relation?.type === "sibling") return anchorParents;
    if (relation?.type === "parent" && relation?.direction === "from-anchor") {
      const coParents = relationships
        .filter(
          (item) =>
            ["spouse", "partner"].includes(item.type) &&
            (item.from === anchorId || item.to === anchorId),
        )
        .map((item) => ({
          key: `co-parent-${item.id}`,
          relationshipId: null,
          mode: "existing",
          personId: item.from === anchorId ? item.to : item.from,
          variant: "biological",
        }));
      return coParents;
    }
    return [];
  };
  const initialRelation = draft?.relation || "";
  const initialAnchorId = draft?.anchorId || initialAnchor?.id || "";
  const initialSurnameSuggestions = surnameSuggestionsFor(
    initialAnchorId,
    initialRelation,
    people,
    relationships,
  );
  const initialParentLinks = person
    ? parentLinksForMember(person.id, relationships)
    : suggestedParentLinks(initialAnchorId, initialRelation);
  const parentsSuggestedFromSibling = Boolean(
    person &&
    initialParentLinks.length &&
    !relationships.some((item) => item.type === "parent" && item.to === person.id),
  );
  const initialPartnerLinks = person ? partnerLinksFor(person.id) : [];
  const [step, setStep] = useState(initialStep);
  const [form, setForm] = useState({
    firstName: person?.firstName || draft?.firstName || "",
    nickname: person?.nickname || "",
    surname: person?.surname || draft?.surname || initialSurnameSuggestions[0] || "",
    maidenName: person?.maidenName || "",
    alternateNames: person?.alternateNames || [],
    birthDate: person?.birthDate || "",
    birthYear: person?.birthYear || draft?.birthYear || "",
    birthApproximate: person?.birthApproximate || false,
    birthLocation: person?.birthLocation || null,
    livedLocations: person?.livedLocations || [],
    deathDate: person?.deathDate || "",
    deathYear: person?.deathYear || "",
    deathApproximate: person?.deathApproximate || false,
    deathLocation: person?.deathLocation || null,
    relation: initialRelation,
    anchorId: initialAnchorId,
    gender: person?.gender || "unspecified",
    factConfidence: person?.factConfidence || "reported",
    provenanceNote: person?.provenanceNote || (draft?.statement ? `Voice-assisted draft: ${draft.statement}` : ""),
    privacyLevel: person?.privacyLevel || "family",
    parentLinks: ensureTwoParentRows(initialParentLinks),
    childLinks: [],
    partnerLinks: initialPartnerLinks,
    marriageYear: "",
    relationshipEndYear: "",
    parentVariant: "biological",
    partnershipVariant: "current",
    relationshipConfidence: "reported",
    relationshipProvenanceNote: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const addAlternateName = () =>
    setForm((current) => ({
      ...current,
      alternateNames: [...(current.alternateNames || []), { name: "", kind: "sindhi_script" }],
    }));
  const updateAlternateName = (index, field, value) =>
    setForm((current) => ({
      ...current,
      alternateNames: (current.alternateNames || []).map((alias, aliasIndex) =>
        aliasIndex === index ? { ...alias, [field]: value } : alias,
      ),
    }));
  const removeAlternateName = (index) =>
    setForm((current) => ({
      ...current,
      alternateNames: (current.alternateNames || []).filter((_, aliasIndex) => aliasIndex !== index),
    }));
  const updateRelation = (event) => {
    const relation = RELATION_OPTIONS.find((option) => option.value === event.target.value);
    if (!relation) {
      setForm((current) => ({
        ...current,
        relation: "",
        ...relationSwitchValues(""),
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      relation: relation.value,
      ...relationSwitchValues(relation.type),
    }));
  };
  const anchorPerson = people.find((item) => item.id === form.anchorId) || anchor;
  const selectedRelation = RELATION_OPTIONS.find((option) => option.value === form.relation);
  const hasSelectedExistingConnection = [form.parentLinks, form.childLinks, form.partnerLinks]
    .some((links = []) => links.some((link) => link.mode !== "placeholder" && Boolean(link.personId)));
  const surnameSuggestions = surnameSuggestionsFor(form.anchorId, form.relation, people, relationships);
  const contextOwnerId = person?.ownerId || anchorPerson?.ownerId;
  const contextPeople = people.filter((item) => !contextOwnerId || item.ownerId === contextOwnerId);
  const descendantIds = new Set();
  const descendantRootId = person?.id || anchorPerson?.id;
  if (descendantRootId) {
    const queue = [descendantRootId];
    while (queue.length) {
      const parentId = queue.shift();
      relationships
        .filter((relationship) => relationship.type === "parent" && relationship.from === parentId)
        .forEach((relationship) => {
          if (descendantIds.has(relationship.to)) return;
          descendantIds.add(relationship.to);
          queue.push(relationship.to);
        });
    }
  }
  const excludedParentIds = person ? [...descendantIds] : [];
  const submit = async (e) => {
    e.preventDefault();
    if (step === 1) return setStep(2);
    setSaving(true);
    setError("");
    setMessage("");
    setDuplicateCandidates([]);
    try {
      const result = await savePerson(form, person);
      if (result?.duplicates?.length) {
        setDuplicateCandidates(result.duplicates);
        setSaving(false);
        return;
      }
      if (result?.noChanges) {
        setMessage(result.message);
        setSaving(false);
        return;
      }
      close();
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };

  const resolveDuplicate = async (candidateId = null) => {
    setSaving(true);
    setError("");
    try {
      await savePerson(form, person, {
        skipDuplicateCheck: true,
        useExistingId: candidateId,
      });
      close();
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  };
  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <form ref={dialogRef} className="add-modal" role="dialog" aria-modal="true" aria-label="Add or edit family member" tabIndex={-1} onSubmit={submit}>
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <div className="steps">
          <span className="active">1</span>
          <i />
          <span className={step === 2 ? "active" : ""}>2</span>
        </div>
        <span className="eyebrow">
          {person
            ? person.canSuggest
              ? "SUGGEST CORRECTION"
              : "EDIT FAMILY MEMBER"
            : `STEP ${step} OF 2`}
        </span>
        <h2>
          {step === 1
            ? person
              ? `Edit ${person.firstName}`
              : `Add family near ${anchorPerson?.firstName || "you"}`
            : "Places and family context"}
        </h2>
        <p>
          {step === 1
            ? person
              ? person.canSuggest
                ? "This person has claimed their profile. Your changes will be sent to them for approval."
                : "You control the identity details on this profile."
              : `Add what you know. Parents, children, or partners will connect this person to ${anchorPerson?.firstName || "your family"}; Vansh infers relationships such as siblings from the family graph.`
            : "Select locations from the city and country results. Typed search text is never saved."}
        </p>
        {step === 1 ? (
          <>
            <div className="form-grid">
              <label>
                First name
                <input
                  required
                  autoFocus
                  name="firstName"
                  value={form.firstName}
                  onChange={update}
                  placeholder="e.g. Pushpa"
                />
              </label>
              <label>
                Current family surname
                <input
                  required
                  name="surname"
                  value={form.surname}
                  onChange={update}
                  list="family-surname-suggestions"
                  placeholder="e.g. Vaswani"
                />
                <datalist id="family-surname-suggestions">
                  {surnameSuggestions.map((surname) => <option value={surname} key={surname} />)}
                </datalist>
                {!person && surnameSuggestions.length > 0 && (
                  <small className="field-hint">Suggested from {anchorPerson?.firstName || "nearby family"}: {surnameSuggestions.join(", ")}</small>
                )}
              </label>
              <label>
                Nickname <small>Optional</small>
                <input
                  name="nickname"
                  value={form.nickname}
                  onChange={update}
                  maxLength={100}
                  placeholder="e.g. Pinky"
                />
              </label>
              <label>
                Maiden / earlier surname <small>Optional</small>
                <input
                  name="maidenName"
                  value={form.maidenName}
                  onChange={update}
                  placeholder="If applicable"
                />
              </label>
              <div className="wide alias-editor">
                <div className="alias-editor-heading">
                  <div>
                    <strong>Alternate names</strong>
                    <small>Optional · Sindhi script, Roman spellings, former names or historical variants</small>
                  </div>
                  <button type="button" className="quiet alias-add" onClick={addAlternateName}>
                    <Plus size={15} /> Add name
                  </button>
                </div>
                {(form.alternateNames || []).map((alias, index) => (
                  <div className="alias-row" key={`alias-${index}`}>
                    <select
                      aria-label={`Alternate name type ${index + 1}`}
                      value={alias.kind || "other"}
                      onChange={(event) => updateAlternateName(index, "kind", event.target.value)}
                    >
                      {NAME_ALIAS_KINDS.map((option) => (
                        <option value={option.value} key={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      aria-label={`Alternate name ${index + 1}`}
                      value={alias.name || ""}
                      onChange={(event) => updateAlternateName(index, "name", event.target.value)}
                      maxLength={160}
                      placeholder={alias.kind === "sindhi_script" ? "e.g. رميش نانواڻي" : "e.g. Ramesh Nanwani"}
                    />
                    <button
                      type="button"
                      className="icon-button alias-remove"
                      aria-label={`Remove alternate name ${index + 1}`}
                      onClick={() => removeAlternateName(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {(form.alternateNames || []).length === 0 && (
                  <p className="alias-empty">Add names this person is also known by. These are searchable but the primary display name stays unchanged.</p>
                )}
              </div>
              <label>
                Gender wording <small>Optional</small>
                <select name="gender" value={form.gender} onChange={update}>
                  <option value="unspecified">Not specified</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="nonbinary">Non-binary</option>
                </select>
              </label>
              {parentsSuggestedFromSibling && (
                <div className="family-context-suggestion wide">
                  <GitFork size={16} />
                  <span><strong>Parents pre-filled from the recorded sibling relationship.</strong> Confirm these are also {person.firstName}&apos;s parents before saving.</span>
                </div>
              )}
              <FamilyConnectionsEditor
                people={contextPeople}
                currentPersonId={person?.id || ""}
                parentLinks={form.parentLinks}
                setParentLinks={(updater) => setForm((current) => ({
                  ...current,
                  parentLinks: typeof updater === "function" ? updater(current.parentLinks) : updater,
                }))}
                childLinks={person ? null : form.childLinks}
                setChildLinks={person ? null : (updater) => setForm((current) => ({
                  ...current,
                  childLinks: typeof updater === "function" ? updater(current.childLinks) : updater,
                }))}
                partnerLinks={form.partnerLinks}
                setPartnerLinks={(updater) => setForm((current) => ({
                  ...current,
                  partnerLinks: typeof updater === "function" ? updater(current.partnerLinks) : updater,
                }))}
                anchorName={anchorPerson?.firstName || ""}
                allowNewPeople={Boolean(person?.canEdit)}
                subjectName={person?.firstName || form.firstName.trim() || "this new person"}
                excludedParentIds={excludedParentIds}
                disabled={false}
              />
              {!person && !hasSelectedExistingConnection && (
                <fieldset className="family-context-group wide fallback-connection">
                  <legend>Connection when family details are unknown</legend>
                  <p>
                    Optional. Use this only when you cannot connect {form.firstName.trim() || "this person"} through a known parent, child, or partner.
                  </p>
                  <div className="fallback-connection-fields">
                    <label>
                      Direct relationship to {anchorPerson?.firstName || "the person you started from"}
                      <select name="relation" value={form.relation} onChange={updateRelation}>
                        <option value="">No additional relationship</option>
                        {RELATION_OPTIONS.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}{option.term ? ` (${option.term})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedRelation?.type === "parent" && (
                      <label>
                        Parent relationship type
                        <select value={form.parentVariant} onChange={(event) => setForm((current) => ({ ...current, parentVariant: event.target.value }))}>
                          <option value="biological">Biological parent</option>
                          <option value="adoptive">Adoptive parent</option>
                          <option value="step">Step-parent</option>
                          <option value="guardian">Guardian / social parent</option>
                          <option value="unspecified">Not specified</option>
                        </select>
                      </label>
                    )}
                    {selectedRelation && (
                      <>
                        <label>
                          Confidence
                          <select value={form.relationshipConfidence} onChange={(event) => setForm((current) => ({ ...current, relationshipConfidence: event.target.value }))}>
                            <option value="reported">Reported</option>
                            <option value="probable">Probable</option>
                            <option value="uncertain">Uncertain</option>
                            <option value="documented">Documented</option>
                            <option value="disputed">Disputed</option>
                          </select>
                        </label>
                        <label>
                          Relationship source <small>Optional</small>
                          <input value={form.relationshipProvenanceNote} maxLength={1000} onChange={(event) => setForm((current) => ({ ...current, relationshipProvenanceNote: event.target.value }))} />
                        </label>
                      </>
                    )}
                    {["spouse", "partner"].includes(selectedRelation?.type) && (
                      <>
                        <label>
                          {selectedRelation.type === "spouse" ? "Year married" : "Year partnership began"} <small>Optional</small>
                          <input inputMode="numeric" maxLength={4} value={form.marriageYear} onChange={(event) => setForm((current) => ({ ...current, marriageYear: event.target.value }))} />
                        </label>
                        <label>
                          {selectedRelation.type === "spouse" ? "Divorce / end year" : "Partnership end year"} <small>Optional</small>
                          <input inputMode="numeric" maxLength={4} value={form.relationshipEndYear} onChange={(event) => setForm((current) => ({ ...current, relationshipEndYear: event.target.value, partnershipVariant: event.target.value ? "former" : current.partnershipVariant }))} />
                        </label>
                        <label>
                          Status
                          <select value={form.partnershipVariant} onChange={(event) => setForm((current) => ({ ...current, partnershipVariant: event.target.value }))}>
                            <option value="current">Current</option>
                            <option value="former">Former</option>
                            <option value="unspecified">Not specified</option>
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                </fieldset>
              )}
            </div>
            {!person && (
              <div className="kinship-tip">
                <GitFork size={17} />
                <span>
                  <strong>Relationships are inferred from connections.</strong>
                  If this person shares recorded parents with someone already in the tree, Vansh will recognize them as siblings. Use the optional direct relationship only when those family details are unknown.
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="form-grid">
            <label>
              Date of birth <small>If known</small>
              <input
                type="date"
                name="birthDate"
                value={form.birthDate}
                onChange={update}
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Birth year <small>{form.birthDate ? "Derived from exact date" : "Approximate is okay"}</small>
              <input
                name="birthYear"
                value={form.birthDate ? form.birthDate.slice(0, 4) : form.birthYear}
                onChange={update}
                disabled={Boolean(form.birthDate)}
                placeholder="e.g. 1942"
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.birthApproximate}
                onChange={(event) => setForm((current) => ({ ...current, birthApproximate: event.target.checked }))}
              />
              Birth date/year is approximate (circa)
            </label>
            <label>
              Date of death <small>If applicable</small>
              <input type="date" name="deathDate" value={form.deathDate} onChange={update} max={new Date().toISOString().slice(0, 10)} />
            </label>
            <label>
              Death year <small>{form.deathDate ? "Derived from exact date" : "Optional"}</small>
              <input name="deathYear" value={form.deathDate ? form.deathDate.slice(0, 4) : form.deathYear} onChange={update} disabled={Boolean(form.deathDate)} placeholder="e.g. 2018" />
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={form.deathApproximate} onChange={(event) => setForm((current) => ({ ...current, deathApproximate: event.target.checked }))} />
              Death date/year is approximate
            </label>
            <label className="wide">
              Place of birth <small>Optional</small>
              <LocationPicker
                value={form.birthLocation}
                legacyValue={person?.legacyBirthPlace}
                onChange={(birthLocation) =>
                  setForm((current) => ({ ...current, birthLocation }))
                }
              />
            </label>
            <label className="wide">
              Place of death <small>Optional</small>
              <LocationPicker
                value={form.deathLocation}
                onChange={(deathLocation) => setForm((current) => ({ ...current, deathLocation }))}
              />
            </label>
            <label className="wide">
              Cities where they have lived
              <small>Add optional years to build their migration story</small>
              <LocationPicker
                multiple
                value={form.livedLocations}
                legacyValue={person?.legacyLivedIn}
                onChange={(livedLocations) =>
                  setForm((current) => ({ ...current, livedLocations }))
                }
              />
            </label>
            <label>
              Confidence
              <select name="factConfidence" value={form.factConfidence} onChange={update}>
                <option value="reported">Reported by family</option>
                <option value="probable">Probable</option>
                <option value="uncertain">Uncertain</option>
                <option value="documented">Documented / sourced</option>
                <option value="disputed">Disputed</option>
              </select>
            </label>
            <label>
              Living-person privacy
              <select name="privacyLevel" value={form.privacyLevel} onChange={update}>
                <option value="private">Private</option>
                <option value="family">Shared family only</option>
                <option value="match_clues">Allow limited match clues</option>
              </select>
            </label>
            <label className="wide">
              Source / provenance note <small>Optional</small>
              <textarea name="provenanceNote" rows="3" value={form.provenanceNote} onChange={update} placeholder="e.g. According to Sonia; family register; uncertain spelling" />
            </label>
          </div>
        )}
        {duplicateCandidates.length > 0 && (
          <div className="duplicate-review">
            <div className="privacy-banner warning">
              <CircleHelp size={20} />
              <div>
                <strong>A similar person already exists</strong>
                <p>
                  Review the existing record before creating another copy.
                  Nothing is merged automatically.
                </p>
              </div>
            </div>
            {duplicateCandidates.map((candidate) => (
              <div className="duplicate-row" key={candidate.id}>
                <div>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.details}</span>
                  <small>{candidate.score} match score{candidate.claimed ? " · claimed profile" : ""}</small>
                </div>
                <button
                  type="button"
                  className="quiet"
                  disabled={saving || !candidate.canReuse}
                  onClick={() => resolveDuplicate(candidate.id)}
                  title={candidate.canReuse ? "Use this managed record" : "This profile is managed by another family member"}
                >
                  {candidate.canReuse ? "Use existing" : "Managed by another relative"}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="quiet create-anyway"
              disabled={saving}
              onClick={() => resolveDuplicate(null)}
            >
              Create a separate person anyway
            </button>
          </div>
        )}
        {error && <div className="auth-message">{error}</div>}
        {message && <div className="auth-message">{message}</div>}
        <div className="modal-actions">
          {step === 2 && (
            <button type="button" className="quiet" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button className="primary" disabled={saving}>
            {step === 1 ? (
              <>
                Continue <ArrowRight size={16} />
              </>
            ) : saving ? (
              <>
                <LoaderCircle className="spin" size={16} /> Saving
              </>
            ) : (
              <>
                {person
                  ? person.canSuggest
                    ? "Send correction for approval"
                    : "Save changes"
                  : "Place in family map"}{" "}
                <Check size={16} />
              </>
            )}
          </button>
        </div>
        <div className="form-privacy">
          <LockKeyhole size={14} /> Common kinship terms vary between Sindhi
          families and regions.
        </div>
      </form>
    </div>
  );
}

function FamilyApp({ session }) {
  const [route, navigate] = useUrlPage();
  const page = route.page;
  const setPage = (nextPage) => navigate(nextPage);
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [matches, setMatches] = useState([]);
  const [identityCandidates, setIdentityCandidates] = useState([]);
  const [identityPromptCandidate, setIdentityPromptCandidate] = useState(null);
  const [inbox, setInbox] = useState([]);
  const [familyUpdates, setFamilyUpdates] = useState([]);
  const [invitationActivity, setInvitationActivity] = useState([]);
  const [friendCode, setFriendCode] = useState("");
  const [friendships, setFriendships] = useState([]);
  const [sharedFriendTree, setSharedFriendTree] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [placeEditing, setPlaceEditing] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [placeholdersFor, setPlaceholdersFor] = useState(null);
  const [linkingPeople, setLinkingPeople] = useState(false);
  const [mergingPeople, setMergingPeople] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const [familyViewHint, setFamilyViewHint] = useState("people");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const loadFamily = async () => {
      const [profileResult, peopleResult, relationshipsResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single(),
          supabase.from("family_members").select("*").order("created_at"),
          supabase.from("relationships").select("*").order("created_at"),
        ]);
      if (
        profileResult.error ||
        peopleResult.error ||
        relationshipsResult.error
      ) {
        if (active) {
          setDataError(
            profileResult.error?.message ||
              peopleResult.error?.message ||
              relationshipsResult.error?.message,
          );
          setLoading(false);
        }
        return;
      }
      let rows = peopleResult.data;
      if (
        !rows.some(
          (row) => row.owner_id === session.user.id && row.is_self,
        ) && profileResult.data.surname
      ) {
        const selfResult = await supabase.rpc("ensure_self_family_member");
        if (selfResult.error) {
          if (active) {
            setDataError(selfResult.error.message);
            setLoading(false);
          }
          return;
        }
        rows = [...rows, selfResult.data];
      }
      try {
        rows = await loadConnectionSnapshots(supabase, rows);
      } catch (snapshotError) {
        if (active) {
          setDataError(snapshotError.message || "Could not load relationship details.");
          setLoading(false);
        }
        return;
      }
      const [matchResult, identityResult, inboxResult, invitationResult, familyUpdateResult, friendCodeResult, friendshipResult] = await Promise.all([
        supabase.rpc("find_family_matches"),
        supabase.rpc("find_identity_claim_candidates"),
        supabase.rpc("get_verification_inbox"),
        supabase.rpc("get_my_invitation_activity"),
        supabase.rpc("get_family_update_notifications"),
        supabase.rpc("get_my_friend_discovery_code"),
        supabase.rpc("get_friendships"),
      ]);
      if (!active) return;
      setProfile(profileResult.data);
      const familyState = familyStateFromRows(rows, relationshipsResult.data, session.user.id);
      setPeople(familyState.people);
      setRelationships(familyState.relationships);
      setMatches(
        (matchResult.data || []).map((row, index) => ({
          id: row.candidate_member_id,
          ownerId: row.candidate_owner_id,
          name: row.display_name,
          initials: row.display_name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
          color: colors[index % colors.length],
          score: row.score,
          shared: row.shared_details || [],
          details:
            [
              row.birth_year && `Born ${row.birth_year}`,
              row.birth_place,
              row.lived_in && `lived in ${row.lived_in}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Limited details shared",
        })),
      );
      setIdentityCandidates(
        (identityResult.data || []).map((row, index) => ({
          id: row.candidate_member_id,
          personCode: row.person_code,
          name: row.display_name,
          initials: row.display_name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
          color: colors[(index + 2) % colors.length],
          score: row.score,
          shared: row.shared_details || [],
          details:
            [
              row.birth_year && `Born ${row.birth_year}`,
              row.birth_place,
              row.lived_in && `lived in ${row.lived_in}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Limited details shared",
        })),
      );
      setInbox(inboxResult.data || []);
      setInvitationActivity(invitationResult.data || []);
      if (!familyUpdateResult.error) setFamilyUpdates(familyUpdateResult.data || []);
      if (!friendCodeResult.error) setFriendCode(friendCodeResult.data || "");
      if (!friendshipResult.error) setFriendships(friendshipResult.data || []);
      setLoading(false);
    };
    loadFamily().catch((loadError) => {
      if (active) {
        setDataError(loadError.message || "Could not load your family.");
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [session.user.id, session.user.user_metadata.family_surname]);

  useEffect(() => {
    const candidate = identityCandidates[0] || null;
    const timer = window.setTimeout(() => {
      if (!candidate) {
        setIdentityPromptCandidate(null);
        return;
      }
      const key = `vansh-identity-prompt:${session.user.id}:${candidate.id}`;
      if (window.sessionStorage.getItem(key) === "dismissed") return;
      setIdentityPromptCandidate((current) => current || candidate);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identityCandidates, session.user.id]);

  const closeIdentityPrompt = () => {
    if (identityPromptCandidate) {
      window.sessionStorage.setItem(
        `vansh-identity-prompt:${session.user.id}:${identityPromptCandidate.id}`,
        "dismissed",
      );
    }
    setIdentityPromptCandidate(null);
  };

  const refreshTrustData = async () => {
    const [matchResult, identityResult, inboxResult, invitationResult, familyUpdateResult, friendshipResult] = await Promise.all([
      supabase.rpc("find_family_matches"),
      supabase.rpc("find_identity_claim_candidates"),
      supabase.rpc("get_verification_inbox"),
      supabase.rpc("get_my_invitation_activity"),
      supabase.rpc("get_family_update_notifications"),
      supabase.rpc("get_friendships"),
    ]);
    if (!matchResult.error)
      setMatches(
        (matchResult.data || []).map((row, index) => ({
          id: row.candidate_member_id,
          ownerId: row.candidate_owner_id,
          name: row.display_name,
          initials: row.display_name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
          color: colors[index % colors.length],
          score: row.score,
          shared: row.shared_details || [],
          details:
            [
              row.birth_year && `Born ${row.birth_year}`,
              row.birth_place,
              row.lived_in && `lived in ${row.lived_in}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Limited details shared",
        })),
      );
    if (!identityResult.error)
      setIdentityCandidates(
        (identityResult.data || []).map((row, index) => ({
          id: row.candidate_member_id,
          personCode: row.person_code,
          name: row.display_name,
          initials: row.display_name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
          color: colors[(index + 2) % colors.length],
          score: row.score,
          shared: row.shared_details || [],
          details:
            [
              row.birth_year && `Born ${row.birth_year}`,
              row.birth_place,
              row.lived_in && `lived in ${row.lived_in}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Limited details shared",
        })),
      );
    if (!inboxResult.error) setInbox(inboxResult.data || []);
    if (!invitationResult.error) setInvitationActivity(invitationResult.data || []);
    if (!familyUpdateResult.error) setFamilyUpdates(familyUpdateResult.data || []);
    if (!friendshipResult.error) setFriendships(friendshipResult.data || []);
  };

  useEffect(() => {
    if (page !== "matches") return undefined;
    let active = true;
    const refreshFriends = async () => {
      const result = await supabase.rpc("get_friendships");
      if (active && !result.error) setFriendships(result.data || []);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFriends();
    };
    void refreshFriends();
    window.addEventListener("focus", refreshFriends);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshFriends);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [page]);

  const refreshFamilyData = async () => {
    try {
      const [peopleResult, relationshipsResult] = await Promise.all([
        supabase.from("family_members").select("*").order("created_at"),
        supabase.from("relationships").select("*").order("created_at"),
      ]);
      if (peopleResult.error) throw peopleResult.error;
      if (relationshipsResult.error) throw relationshipsResult.error;
      const rows = await loadConnectionSnapshots(supabase, peopleResult.data);
      const familyState = familyStateFromRows(rows, relationshipsResult.data, session.user.id);
      setPeople(familyState.people);
      setRelationships(familyState.relationships);
      setDataError("");
      await refreshTrustData();
    } catch (refreshError) {
      setDataError(refreshError.message || "Could not refresh your family.");
      setLoading(false);
      throw refreshError;
    }
  };

  const refreshFamilyDataRef = useRef(null);
  useEffect(() => {
    refreshFamilyDataRef.current = refreshFamilyData;
  });

  useEffect(() => {
    let timer = null;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshFamilyDataRef.current?.().catch((error) => {
          void supabase.from("application_errors").insert({
            user_id: session.user.id,
            message: error.message || "Realtime refresh failed",
            context: { source: "realtime" },
          });
        });
      }, 180);
    };
    const channel = supabase
      .channel(`vansh-live-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_members" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "relationships" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "identity_claim_requests" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profile_change_requests" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_invitations" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_connection_requests" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_update_notifications" }, scheduleRefresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [session.user.id]);

  const savePerson = async (form, existing, options = {}) => {
    const self = people.find((person) => person.isSelf);
    if (!self)
      throw new Error(
        "Your own family profile is still being prepared. Please refresh and try again.",
      );

    const anchorPerson = existing
      ? null
      : people.find((person) => person.id === form.anchorId);
    if (!existing && !anchorPerson)
      throw new Error(
        "Choose an existing family member to connect this person to.",
      );

    const validated = validatePersonForm(form);
    const effectiveBirthYear = validated.birthYear;
    const livedLocations = validated.livedLocations;
    const effectiveDeathYear = validated.deathYear;

    const payload = {
      owner_id:
        existing?.ownerId ||
        anchorPerson?.ownerId ||
        self.ownerId ||
        session.user.id,
      first_name: validated.firstName,
      surname: validated.surname,
      nickname: form.nickname.trim() || null,
      maiden_name: form.maidenName.trim() || null,
      alternate_names: validated.alternateNames,
      gender: form.gender,
      birth_date: form.birthDate || null,
      birth_year: effectiveBirthYear,
      birth_approximate: Boolean(form.birthApproximate),
      birth_location: form.birthLocation,
      death_date: form.deathDate || null,
      death_year: effectiveDeathYear,
      death_approximate: Boolean(form.deathApproximate),
      death_location: form.deathLocation,
      death_place: form.deathLocation?.display || null,
      lived_locations: livedLocations,
      birth_place:
        form.birthLocation?.display || existing?.legacyBirthPlace || null,
      lived_in: livedLocations[0]?.display || existing?.legacyLivedIn || null,
      fact_confidence: form.factConfidence || "reported",
      provenance_note: form.provenanceNote?.trim() || null,
      privacy_level: form.privacyLevel || "family",
    };

    if (!payload.first_name || !payload.surname)
      throw new Error("First name and surname are required.");

    const details = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== "owner_id"),
    );
    const hasFormConnection = [form.parentLinks, form.childLinks, form.partnerLinks]
      .some((links = []) => links.some((link) => link.mode !== "placeholder" && Boolean(link.personId)));
    const relation = !existing && !hasFormConnection
      ? RELATION_OPTIONS.find((option) => option.value === form.relation)
      : null;
    const primary = relation ? primaryConnectionFromForm(form, relation) : null;
    const connections = connectionBundleFromForm(
      form,
      existing,
      relationships,
      primary,
    );
    if (!existing && !primary && !hasExistingConnection(connections)) {
      throw new Error(
        "Choose at least one existing parent, child, or partner, or add the optional direct relationship.",
      );
    }

    // Claimed people control their profile and graph connections. Other
    // relatives submit one coherent proposal to the existing launch inbox.
    if (existing?.canSuggest) {
      const suggestion = await supabase.rpc("propose_family_correction", {
        p_member_id: existing.id,
        p_expected_revision: existing.revision || 1,
        p_expected_relationship_hash: existing.relationshipHash,
        p_details: details,
        p_connections: connections,
        p_reason: null,
      });
      if (suggestion.error) throw suggestion.error;
      const outcome = correctionSubmissionOutcome(suggestion.data);
      if (outcome.noChanges) return outcome;
      void supabase.functions.invoke("send-request-notification", {
        body: { kind: "correction", requestId: outcome.requestId },
      });
      await refreshTrustData();
      return outcome;
    }

    if (!existing && !options.skipDuplicateCheck) {
      const duplicateResult = await supabase.rpc("find_duplicate_members", {
        p_owner_id: anchorPerson.ownerId,
        p_first_name: payload.first_name,
        p_surname: payload.surname,
        p_birth_date: payload.birth_date,
        p_birth_year: payload.birth_year,
        p_birth_place: payload.birth_place,
        p_exclude_id: null,
      });
      if (duplicateResult.error) throw duplicateResult.error;
      if (duplicateResult.data?.length)
        return {
          duplicates: duplicateResult.data.map((row) => ({
            id: row.member_id,
            name: row.display_name,
            score: row.score,
            claimed: row.claimed,
            canReuse: Boolean(people.find((person) => person.id === row.member_id)?.canEdit),
            details:
              [
                row.birth_year && `Born ${row.birth_year}`,
                row.birth_place,
                row.lived_in && `lived in ${row.lived_in}`,
              ]
                .filter(Boolean)
                .join(" · ") || "No additional details recorded",
          })),
        };
    }

    if (existing) {
      if (existing.isPlaceholder) details.fill_placeholder = true;
      const hasNewPartners = connections.partners.some((partner) => partner.new_person);
      const editArgs = {
        p_member_id: existing.id,
        p_expected_revision: existing.revision || 1,
        p_expected_relationship_hash: existing.relationshipHash,
        p_details: details,
        p_connections: connections,
      };
      const memberResult = hasNewPartners
        ? await supabase.rpc("edit_family_member_with_new_partners", editArgs)
        : await supabase.rpc("edit_family_member", editArgs);
      if (memberResult.error) throw memberResult.error;
      await refreshFamilyData();
      return { updated: true };
    }

    const bundle = { fallback: primary, ...connections };

    if (options.useExistingId) {
      const duplicate = people.find(
        (person) =>
          person.id === options.useExistingId &&
          person.ownerId === anchorPerson.ownerId &&
          person.canEdit,
      );
      if (!duplicate)
        throw new Error("That existing record is managed by another family member and cannot be reused here.");
      const linkResult = await supabase.rpc("link_family_members_bundle", {
        p_anchor_id: anchorPerson.id,
        p_member_id: duplicate.id,
        p_bundle: bundle,
        p_idempotency_key: crypto.randomUUID(),
      });
      if (linkResult.error) throw linkResult.error;
      await refreshFamilyData();
      return { reused: true };
    }

    const memberResult = await supabase.rpc("create_family_relative", {
      p_anchor_id: anchorPerson.id,
      p_details: details,
      p_bundle: bundle,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (memberResult.error) throw memberResult.error;

    await refreshFamilyData();
    return { created: true };
  };

  const connect = async (match, status) => {
    const result =
      status === "requested"
        ? await supabase.rpc("request_family_match", {
            p_candidate_member_id: match.id,
          })
        : await supabase.rpc("dismiss_family_match", {
            p_candidate_member_id: match.id,
          });
    if (result.error) throw result.error;
    if (status === "requested" && result.data)
      void supabase.functions.invoke("send-request-notification", {
        body: { kind: "family", requestId: result.data },
      });
    await refreshTrustData();
  };

  const requestIdentity = async (candidate) => {
    const result = await supabase.rpc("request_identity_claim", {
      p_candidate_member_id: candidate.id,
    });
    if (result.error) throw result.error;
    if (result.data)
      void supabase.functions.invoke("send-request-notification", {
        body: { kind: "identity", requestId: result.data },
      });
    await refreshTrustData();
  };

  const dismissIdentity = async (candidate) => {
    const result = await supabase.rpc("dismiss_identity_candidate", {
      p_candidate_member_id: candidate.id,
    });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const respondInbox = async (item, accept) => {
    const result =
      item.kind === "invitation"
        ? await supabase.rpc("respond_family_invitation", {
            p_invitation_id: item.request_id,
            p_accept: accept,
          })
        : item.kind === "correction"
          ? await supabase.rpc("respond_profile_correction", {
              p_request_id: item.request_id,
              p_accept: accept,
            })
          : await supabase.rpc("respond_verification_request", {
              p_kind: item.kind,
              p_request_id: item.request_id,
              p_accept: accept,
            });
    if (result.error) throw result.error;
    await refreshFamilyData();
  };

  const requestFriend = async (code) => {
    const result = await supabase.rpc("request_friend_by_code", { p_code: code });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const respondFriend = async (friendship, accept) => {
    const result = await supabase.rpc("respond_friend_request", {
      p_friendship_id: friendship.friendship_id,
      p_accept: accept,
    });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const cancelFriend = async (friendship) => {
    const result = await supabase.rpc("cancel_friend_request", { p_friendship_id: friendship.friendship_id });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const removeFriend = async (friendship) => {
    const result = await supabase.rpc("remove_friend", { p_friendship_id: friendship.friendship_id });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const setFriendSharing = async (friendship, enabled) => {
    const result = await supabase.rpc("set_friend_tree_sharing", {
      p_friendship_id: friendship.friendship_id,
      p_enabled: enabled,
    });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const viewFriendTree = async (friendship) => {
    const result = await supabase.rpc("get_shared_friend_tree", { p_friendship_id: friendship.friendship_id });
    if (result.error) throw result.error;
    setSharedFriendTree(sharedTreeStateFromSnapshot(result.data));
  };

  const rotateFriendCode = async () => {
    if (!window.confirm("Rotate your friend code? The current code will stop working.")) return;
    const result = await supabase.rpc("rotate_my_friend_discovery_code");
    if (result.error) throw result.error;
    setFriendCode(result.data || "");
  };

  const mergePeople = async (keepId, mergeId, fieldChoices) => {
    const result = await supabase.rpc("merge_family_members", {
      p_keep_id: keepId,
      p_merge_id: mergeId,
      p_field_choices: fieldChoices,
    });
    if (result.error) throw result.error;
    await refreshFamilyData();
  };
  const saveProfile = async (form) => {
    const payload = {
      display_name: `${form.firstName.trim()} ${form.surname.trim()}`.trim(),
      first_name: form.firstName.trim(),
      surname: form.surname.trim(),
      birth_surname: form.birthSurname?.trim() || null,
      birth_date: form.birthDate || null,
      birth_location: form.birthLocation || null,
      current_location: form.currentLocation || null,
      birth_location_text: form.birthLocation?.display || null,
      current_location_text: form.currentLocation?.display || null,
      location: form.currentLocation?.display || null,
      discovery_enabled: Boolean(form.discoveryEnabled),
      living_person_privacy: form.livingPrivacy,
      updated_at: new Date().toISOString(),
    };
    if (!payload.first_name || !payload.surname) throw new Error("First name and surname are required.");
    const result = await supabase.from("profiles").update(payload).eq("id", session.user.id).select().single();
    if (result.error) throw result.error;
    setProfile(result.data);
    const self = people.find((person) => person.isSelf || person.linkedUserId === session.user.id);
    if (self?.canEdit) {
      const changes = {
        first_name: payload.first_name,
        surname: payload.surname,
        maiden_name: payload.birth_surname,
        birth_date: payload.birth_date,
        birth_year: payload.birth_date ? Number(payload.birth_date.slice(0, 4)) : (self.birthYear ? Number(self.birthYear) : null),
        birth_location: payload.birth_location,
        birth_place: payload.birth_location_text,
      };
      const selfUpdate = await supabase.rpc("update_family_member_with_revision", {
        p_member_id: self.id,
        p_expected_revision: self.revision || 1,
        p_changes: changes,
      });
      if (!selfUpdate.error) await refreshFamilyData();
    }
  };

  const previewDeleteAccount = async () => {
    const { data, error } = await supabase.rpc("preview_account_deletion");
    if (error) throw error;
    return data || {};
  };

  const deleteAccount = async () => {
    const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Could not delete the account.");
    await supabase.auth.signOut();
  };

  const markFamilyUpdatesRead = async () => {
    const result = await supabase.rpc("mark_family_update_notifications_read");
    if (result.error) throw result.error;
    setFamilyUpdates((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  };

  const revokeInvite = async (invitation) => {
    const result = await supabase.rpc("revoke_family_invitation", { p_invitation_id: invitation.invitation_id });
    if (result.error) throw result.error;
    await refreshTrustData();
  };

  const resendInvite = async (invitation) => {
    const { data, error } = await supabase.functions.invoke("send-family-invite", {
      body: { resendInvitationId: invitation.invitation_id },
    });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Could not resend the invitation.");
    await refreshTrustData();
  };

  const importVoiceFamily = async (draft) => {
    const payload = buildVoiceImportPayload(draft);
    const result = await supabase.rpc("import_voice_family_story", {
      p_narrator_id: payload.narratorId,
      p_people: payload.people,
      p_relationships: payload.relationships,
      p_idempotency_key: payload.idempotencyKey,
    });
    if (result.error) throw result.error;
    await refreshFamilyData();
    return result.data;
  };

  const addPlaceholders = async (anchor, totalCount) => {
    const siblingIds = new Set(
      siblingDetailsFor(anchor.id, relationships).map((sibling) => sibling.id),
    );
    const missingCount = Math.max(0, totalCount - siblingIds.size);
    if (!missingCount) return;
    const result = await supabase.rpc("add_placeholder_siblings", {
      p_anchor_id: anchor.id,
      p_desired_total: totalCount,
      p_displayed_sibling_ids: [...siblingIds],
    });
    if (result.error) throw result.error;
    await refreshFamilyData();
  };
  const linkPeople = async (
    personA,
    personB,
    relation,
    startYear = "",
    variant = "unspecified",
    sharedParentIds = [],
    confidence = "reported",
    provenanceNote = "",
  ) => {
    if (!personA || !personB || personA.id === personB.id)
      throw new Error("Choose two different people.");
    if (personA.ownerId !== personB.ownerId)
      throw new Error(
        "These records belong to different family graphs and cannot be linked directly.",
      );
    if (
      startYear &&
      (!/^\d{4}$/.test(startYear) ||
        Number(startYear) < 1800 ||
        Number(startYear) > new Date().getFullYear())
    )
      throw new Error("Enter a valid four-digit relationship year.");

    const links = [];

    if (relation === "sibling") {
      const knownParents = [
        ...new Set([
          ...parentIdsFor(personA.id, relationships),
          ...parentIdsFor(personB.id, relationships),
        ]),
      ];
      if (knownParents.length && !sharedParentIds.length)
        throw new Error(
          "Select at least one shared parent so Vansh can distinguish full and half siblings.",
        );

      if (sharedParentIds.length) {
        sharedParentIds.forEach((parentId) => {
          [personA.id, personB.id].forEach((childId) => {
            const exists = relationships.some(
              (item) =>
                item.type === "parent" &&
                item.from === parentId &&
                item.to === childId,
            );
            if (!exists)
              links.push(relationshipRpcArgs(parentId, childId, "parent", {
                variant:
                  relationships.find(
                    (item) =>
                      item.type === "parent" &&
                      item.from === parentId &&
                      [personA.id, personB.id].includes(item.to),
                  )?.variant || "biological",
                confidence,
                provenanceNote,
              }));
          });
        });
      } else {
        const duplicate = relationships.some(
          (item) =>
            item.type === "sibling" &&
            ((item.from === personA.id && item.to === personB.id) ||
              (item.from === personB.id && item.to === personA.id)),
        );
        if (duplicate)
          throw new Error("That sibling relationship is already recorded.");
        links.push(relationshipRpcArgs(personA.id, personB.id, "sibling", {
          variant: "reported",
          confidence,
          provenanceNote,
        }));
      }
    } else {
      const type =
        relation === "parent-a" || relation === "parent-b"
          ? "parent"
          : relation;
      const from = relation === "parent-b" ? personB.id : personA.id;
      const to = relation === "parent-b" ? personA.id : personB.id;
      const symmetric = ["spouse", "partner"].includes(type);
      const duplicate = relationships.some(
        (item) =>
          item.type === type &&
          ((item.from === from && item.to === to) ||
            (symmetric && item.from === to && item.to === from)),
      );
      if (duplicate)
        throw new Error("That direct relationship is already recorded.");
      links.push(relationshipRpcArgs(from, to, type, {
        variant:
          type === "parent"
            ? variant || "biological"
            : type === "sibling" ? variant || "reported" : null,
        startYear,
        status: ["spouse", "partner"].includes(type) ? variant || "current" : "unspecified",
        confidence,
        provenanceNote,
      }));
    }

    if (!links.length)
      throw new Error(
        "Those people are already connected through the selected parent relationship.",
      );

    const result = await supabase.rpc("link_family_members_batch", {
      p_links: links,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (result.error) throw result.error;
    await refreshFamilyData();
  };
  const deletePerson = async (person) => {
    if (
      !person.canDelete ||
      person.isSelf ||
      !window.confirm(
        `Delete ${person.name}? Their relationship links in your family map will also be removed.`,
      )
    )
      return;
    const result = await supabase.rpc("delete_family_member", {
      p_member_id: person.id,
    });
    if (result.error) {
      window.alert(`Could not delete ${person.name}: ${result.error.message}`);
      return;
    }
    setPeople((current) => current.filter((item) => item.id !== person.id));
    setRelationships((current) =>
      current.filter(
        (relationship) =>
          relationship.from !== person.id && relationship.to !== person.id,
      ),
    );
  };
  const selfPerson = people.find((person) => person.isSelf) || people[0] || null;
  const branchFor = (person) => deriveBranchLabel(person.id, selfPerson?.id, people, relationships);
  const selectedPerson = route.personId ? people.find((person) => person.id === route.personId) : null;
  const hasQuery = query.trim().length > 0;
  if (loading)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        <strong>Opening your family space</strong>
      </div>
    );
  const notificationCount = inbox.filter(
    (item) => item.direction === "incoming" && item.status === "pending",
  ).length + familyUpdates.filter((item) => !item.read_at).length + friendships.filter(
    (item) => item.direction === "incoming" && item.status === "pending",
  ).length;

  if (dataError)
    return (
      <div className="loading-screen error-state">
        <CircleHelp />
        <strong>We could not load your family</strong>
        <p>{dataError}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  return (
    <div className="app">
      <Sidebar
        page={page}
        setPage={setPage}
        open={menu}
        close={() => setMenu(false)}
        people={people}
        openNotes={() => setShowNotes(true)}
        notificationCount={notificationCount}
      />
      <main>
        <Header
          setMenu={setMenu}
          query={query}
          setQuery={setQuery}
          profile={profile}
          self={people.find((person) => person.isSelf)}
          signOut={() => supabase.auth.signOut()}
          notificationCount={notificationCount}
          onNotifications={() => setPage("matches")}
          onProfile={() => setShowProfile(true)}
        />
        {hasQuery ? (
          <SearchResults
            query={query}
            people={people}
            relationships={relationships}
            branchFor={branchFor}
            openPerson={(person) => { setQuery(""); navigate("person", person.id); }}
            goFamily={(view) => { setQuery(""); setFamilyViewHint(view); navigate("family"); }}
            goJourney={() => { setQuery(""); navigate("journey"); }}
          />
        ) : page === "person" && selectedPerson ? (
          <PersonDetail
            person={selectedPerson}
            people={people}
            relationships={relationships}
            branchLabel={branchFor(selectedPerson)}
            back={() => navigate("family")}
            edit={setEditing}
            invite={setInviting}
            openPerson={(person) => navigate("person", person.id)}
          />
        ) : page === "home" ? (
          <Overview
            people={people}
            relationships={relationships}
            matches={matches}
            identityCandidates={identityCandidates}
            profile={profile}
            setPage={setPage}
            openAdd={(anchor = selfPerson) => { setVoiceDraft(null); setAdding(anchor || selfPerson); }}
            inviteRelative={() => {
              const target = people.find((person) => !person.isSelf && !person.linkedUserId && !person.isPlaceholder);
              if (target) setInviting(target);
              else { setVoiceDraft(null); setAdding(selfPerson); }
            }}
            openSurnames={() => { setFamilyViewHint("surnames"); navigate("family"); }}
            addFamilyPlace={() => {
              navigate("journey");
              if (selfPerson) setPlaceEditing(selfPerson);
            }}
          />
        ) : page === "family" ? (
          <Family
            key={familyViewHint}
            people={people}
            relationships={relationships}
            initialView={familyViewHint}
            openAdd={() => { setVoiceDraft(null); setAdding(selfPerson); }}
            editPerson={setEditing}
            deletePerson={deletePerson}
            invitePerson={setInviting}
            openMerge={() => setMergingPeople(true)}
            openPerson={(person) => navigate("person", person.id)}
            openVoice={() => setShowVoice(true)}
          />
        ) : page === "tree" ? (
          <Tree
            people={people}
            relationships={relationships}
            addRelative={(person) => { setVoiceDraft(null); setAdding(person); }}
            addUnknownSiblings={setPlaceholdersFor}
            editPerson={(person) => navigate("person", person.id)}
            openLinkPeople={() => setLinkingPeople(true)}
          />
        ) : page === "journey" ? (
          <JourneyMap
            people={people}
            relationships={relationships}
            branchFor={branchFor}
            openPerson={(person) => navigate("person", person.id)}
            addPlace={(person = selfPerson) => {
              if (person) setPlaceEditing(person);
            }}
          />
        ) : (
          <Connections
            matches={matches}
            identityCandidates={identityCandidates}
            inbox={inbox}
            familyUpdates={familyUpdates}
            invitations={invitationActivity}
            markFamilyUpdatesRead={markFamilyUpdatesRead}
            connect={connect}
            requestIdentity={requestIdentity}
            dismissIdentity={dismissIdentity}
            respondInbox={respondInbox}
            revokeInvite={revokeInvite}
            resendInvite={resendInvite}
            friendCode={friendCode}
            friendships={friendships}
            requestFriend={requestFriend}
            respondFriend={respondFriend}
            cancelFriend={cancelFriend}
            removeFriend={removeFriend}
            setFriendSharing={setFriendSharing}
            viewFriendTree={viewFriendTree}
            rotateFriendCode={rotateFriendCode}
          />
        )}
        <SiteFooter className="app-site-footer" />
      </main>
      {adding && (
        <PersonModal
          anchor={adding}
          people={people}
          relationships={relationships}
          close={() => { setAdding(false); setVoiceDraft(null); }}
          savePerson={savePerson}
          draft={voiceDraft}
        />
      )}
      {editing && (
        <PersonModal
          person={editing}
          people={people}
          relationships={relationships}
          close={() => setEditing(null)}
          savePerson={savePerson}
        />
      )}
      {placeEditing && (
        <PersonModal
          person={placeEditing}
          people={people}
          relationships={relationships}
          initialStep={2}
          close={() => setPlaceEditing(null)}
          savePerson={savePerson}
        />
      )}
      {inviting && (
        <InviteModal person={inviting} close={() => setInviting(null)} onSent={refreshTrustData} />
      )}
      {placeholdersFor && (
        <PlaceholderModal
          anchor={placeholdersFor}
          existingSiblingCount={
            siblingDetailsFor(placeholdersFor.id, relationships).length
          }
          close={() => setPlaceholdersFor(null)}
          addPlaceholders={addPlaceholders}
        />
      )}
      {linkingPeople && (
        <LinkPeopleModal
          people={people}
          relationships={relationships}
          close={() => setLinkingPeople(false)}
          linkPeople={linkPeople}
        />
      )}
      {mergingPeople && (
        <MergePeopleModal
          people={people}
          close={() => setMergingPeople(false)}
          mergePeople={mergePeople}
        />
      )}
      {identityPromptCandidate && (
        <IdentitySuggestionPrompt
          candidate={identityPromptCandidate}
          close={closeIdentityPrompt}
          requestIdentity={requestIdentity}
          dismissIdentity={dismissIdentity}
        />
      )}
      {sharedFriendTree && <SharedFriendTreeModal tree={sharedFriendTree} close={() => setSharedFriendTree(null)} />}
      {showVoice && (
        <VoiceFamilyImport
          people={people}
          relationships={relationships}
          onCommit={importVoiceFamily}
          onOpenTree={() => { setShowVoice(false); navigate("tree"); }}
          onClose={() => setShowVoice(false)}
        />
      )}
      {showProfile && (
        <ProfilePanel
          profile={profile}
          people={people}
          relationships={relationships}
          close={() => setShowProfile(false)}
          saveProfile={saveProfile}
          previewDeleteAccount={previewDeleteAccount}
          deleteAccount={deleteAccount}
        />
      )}
      {showNotes && <PatchNotes close={() => setShowNotes(false)} />}
    </div>
  );
}

function SessionApp() {
  const [session, setSession] = useState(() => (supabase ? undefined : null));
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => setSession(nextSession),
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  if (session === undefined)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        <strong>Opening Vansh</strong>
      </div>
    );
  return session ? <AppErrorBoundary><FamilyApp session={session} /></AppErrorBoundary> : <AuthScreen />;
}

export default function App() {
  const legalPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (legalPath === "/privacy") return <LegalPage type="privacy" />;
  if (legalPath === "/terms") return <LegalPage type="terms" />;
  return <SessionApp />;
}
