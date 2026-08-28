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

const nav = [
  { id: "home", label: "Overview", icon: LayoutDashboard },
  { id: "family", label: "My family", icon: UsersRound },
  { id: "tree", label: "Family map", icon: Network },
  { id: "matches", label: "Connections", icon: Sparkles },
];

const APP_VERSION = "0.12.0";

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
    birthYear: row.birth_year?.toString() || "",
    birthDate: row.birth_date || "",
    birthLocation: row.birth_location || null,
    livedLocations: row.lived_locations || [],
    birthPlace: row.birth_location?.display || row.birth_place || "",
    livedIn: row.lived_locations?.length
      ? row.lived_locations.map((location) => location.display).join(" · ")
      : row.lived_in || "",
    legacyBirthPlace: !row.birth_location ? row.birth_place || "" : "",
    legacyLivedIn: !row.lived_locations?.length ? row.lived_in || "" : "",
    side: row.family_side || "Other",
    gender: row.gender || "unspecified",
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
    canSuggest: isClaimed && !isIdentityOwner,
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

const parentIdsFor = (personId, relationships) =>
  relationships
    .filter(
      (relationship) =>
        relationship.type === "parent" && relationship.to === personId,
    )
    .map((relationship) => relationship.from);

const siblingDetailsFor = (personId, relationships) => {
  const myParentRelationships = relationships.filter(
    (relationship) =>
      relationship.type === "parent" && relationship.to === personId,
  );
  const myParentIds = new Set(
    myParentRelationships.map((relationship) => relationship.from),
  );
  const candidateIds = new Set();

  relationships.forEach((relationship) => {
    if (
      relationship.type === "parent" &&
      myParentIds.has(relationship.from)
    )
      candidateIds.add(relationship.to);
    if (
      relationship.type === "sibling" &&
      (relationship.from === personId || relationship.to === personId)
    )
      candidateIds.add(
        relationship.from === personId ? relationship.to : relationship.from,
      );
  });

  candidateIds.delete(personId);
  return [...candidateIds].map((id) => {
    const theirParents = relationships.filter(
      (relationship) =>
        relationship.type === "parent" && relationship.to === id,
    );
    const shared = theirParents
      .map((theirRelationship) => {
        const mine = myParentRelationships.find(
          (relationship) =>
            relationship.from === theirRelationship.from,
        );
        if (!mine) return null;
        const variants = [
          mine.variant || "unspecified",
          theirRelationship.variant || "unspecified",
        ];
        return {
          parentId: theirRelationship.from,
          stepLike: variants.some((value) =>
            ["step", "guardian"].includes(value),
          ),
        };
      })
      .filter(Boolean);
    const directReported = relationships.some(
      (relationship) =>
        relationship.type === "sibling" &&
        ((relationship.from === personId && relationship.to === id) ||
          (relationship.from === id && relationship.to === personId)),
    );
    const familyShared = shared.filter((item) => !item.stepLike);

    return {
      id,
      sharedParentIds: familyShared.map((item) => item.parentId),
      kind: familyShared.length >= 2
        ? "full"
        : familyShared.length === 1
          ? "half"
          : shared.some((item) => item.stepLike)
            ? "step"
            : directReported
              ? "reported"
              : "reported",
    };
  });
};

function AuthScreen() {
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({
    firstName: "",
    surname: "",
    birthDate: "",
    birthLocation: "",
    location: "",
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
                birth_date: form.birthDate || null,
                birth_location: form.birthLocation.trim() || null,
                location: form.location.trim() || null,
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
                <input
                  name="birthLocation"
                  value={form.birthLocation}
                  onChange={update}
                  placeholder="City or country"
                />
              </label>
              <label className="wide">
                Where do you live? <small>Optional</small>
                <input
                  name="location"
                  value={form.location}
                  onChange={update}
                  placeholder="City or country"
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
          <div className="form-privacy">
            <LockKeyhole size={14} /> Your information is encrypted and
            protected by account-level access rules.
          </div>
        </form>
      </section>
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
  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <section className="review-modal patch-notes">
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

function Header({ setMenu, query, setQuery, profile, self, signOut, notificationCount = 0, onNotifications }) {
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
          placeholder="Search your people, surnames or places"
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
        <Avatar person={current} size="small" />
        <div>
          <strong>
            {profile?.display_name?.split(" ")[0] || "Family keeper"}
          </strong>
          <span>Private family space</span>
        </div>
        <button className="signout" onClick={signOut} title="Sign out">
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

function Overview({ people, matches, profile, setPage, openAdd }) {
  const surnameData = Object.values(
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
  ).slice(0, 4);
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
        <button className="primary" onClick={openAdd}>
          <Plus size={18} /> Add family member
        </button>
      </section>
      <section className="stats">
        <Stat
          icon={UsersRound}
          value={people.length}
          label="People added"
          tone="green"
        />
        <Stat
          icon={Link2}
          value={surnameData.length}
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
                  <strong>{match.score}%</strong>
                  <span>match</span>
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
          <button className="full-link" onClick={() => setPage("family")}>
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

function Family({ people, openAdd, editPerson, deletePerson, invitePerson, openMerge }) {
  return (
    <div className="page inner-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR RECORDS</span>
          <h1>My family</h1>
          <p>
            People and family names you have added or that family shared with
            you.
          </p>
        </div>
        <div className="heading-actions">
          <button className="quiet" onClick={openMerge}>
            <Link2 size={17} /> Merge duplicates
          </button>
          <button className="primary" onClick={openAdd}>
            <Plus size={18} /> Add family member
          </button>
        </div>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input placeholder="Find someone" />
        </div>
        <button className="filter">
          <ListFilter size={17} /> All branches
        </button>
      </div>
      <div className="people-grid">
        {people.map((person) => (
          <article
            className={`person-card ${person.isPlaceholder ? "placeholder-card" : ""}`}
            key={person.id}
          >
            <div className="person-card-top">
              <Avatar person={person} size="large" />
              <span className="verified">
                <Check size={12} />{" "}
                {person.isPlaceholder
                  ? "Missing person slot"
                  : person.isIdentityOwner
                    ? "Your verified profile"
                    : person.isClaimed
                      ? "Claimed profile"
                      : person.isSelf
                        ? "Your profile"
                        : "Unclaimed family record"}
              </span>
            </div>
            <h3>{person.name}</h3>
            <p>
              {person.isPlaceholder
                ? "Name, dates and locations have not been identified yet."
                : person.birthYear
                  ? `Born ${person.birthYear}${person.birthPlace ? ` in ${person.birthPlace}` : ""}`
                  : "Birth year unknown"}
            </p>
            <div className="person-meta">
              <span>
                <GitFork size={14} /> {person.side}
              </span>
              {person.maidenName && <span>née {person.maidenName}</span>}
              {person.livedLocations.map((location) => (
                <span
                  key={location.residenceId || location.providerId}
                  title={residencePeriod(location) || undefined}
                >
                  <MapPin size={12} /> {residenceLabel(location)}
                </span>
              ))}
              {person.canEdit &&
                (person.legacyLivedIn || person.legacyBirthPlace) && (
                  <button
                    className="legacy-chip"
                    onClick={() => editPerson(person)}
                  >
                    <MapPin size={12} /> Tap to correct location
                  </button>
                )}
            </div>
            <div className="person-actions">
              {person.canEdit ? (
                <button onClick={() => editPerson(person)}>
                  {person.isPlaceholder ? "Fill this slot" : "Edit details"}{" "}
                  <ArrowRight size={14} />
                </button>
              ) : person.canSuggest ? (
                <button onClick={() => editPerson(person)}>
                  Suggest correction <ArrowRight size={14} />
                </button>
              ) : (
                <span>Read-only shared record</span>
              )}
              <div>
                {!person.isSelf && !person.linkedUserId && (
                  <button onClick={() => invitePerson(person)}>
                    <UserPlus size={13} /> Invite
                  </button>
                )}
                {person.canDelete && (
                  <button
                    className="delete-person"
                    onClick={() => deletePerson(person)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
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
}) {
  const [view, setView] = useState("traditional");
  const [degreeLimit, setDegreeLimit] = useState("2");
  const traditionalCanvasRef = useRef(null);
  const traditionalUnitRefs = useRef(new Map());
  const [traditionalLines, setTraditionalLines] = useState({
    width: 0,
    height: 0,
    paths: [],
  });
  const root = people.find((person) => person.isSelf) || people[0];
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
  const networkPeople = people.filter(
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
  const displayParents = new Map(
    people.map((person) => [person.id, new Set()]),
  );
  relationships.forEach((relationship) => {
    if (relationship.type === "parent")
      displayParents.get(relationship.to)?.add(relationship.from);
    if (relationship.type === "child")
      displayParents.get(relationship.from)?.add(relationship.to);
  });
  // A sibling-only placeholder belongs in its known sibling's visual branch,
  // without persisting inferred parent relationships.
  for (let pass = 0; pass < people.length; pass += 1) {
    relationships.forEach((relationship) => {
      if (relationship.type !== "sibling") return;
      const fromParents = displayParents.get(relationship.from);
      const toParents = displayParents.get(relationship.to);
      if (!fromParents || !toParents) return;
      if (!fromParents.size && toParents.size)
        toParents.forEach((parentId) => fromParents.add(parentId));
      if (!toParents.size && fromParents.size)
        fromParents.forEach((parentId) => toParents.add(parentId));
    });
  }
  // Each person is rendered once. Partnerships are edges rather than a single
  // two-person unit, so remarriage and multiple partners do not force one
  // relationship to "win" the layout.
  const assignedUnit = new Map();
  const traditionalUnits = [];
  const addUnit = (person) => {
    if (!person || assignedUnit.has(person.id)) return;
    const unit = {
      id: person.id,
      members: [person],
      level: levels[person.id] ?? 0,
    };
    traditionalUnits.push(unit);
    assignedUnit.set(person.id, unit.id);
  };
  people.forEach(addUnit);
  const directlyRelatedAsSiblings = (personAId, personBId) =>
    relationships.some(
      (relationship) =>
        relationship.type === "sibling" &&
        ((relationship.from === personAId && relationship.to === personBId) ||
          (relationship.from === personBId && relationship.to === personAId)),
    ) ||
    [...(displayParents.get(personAId) || [])].some((parentId) =>
      displayParents.get(personBId)?.has(parentId),
    );
  const unitRelatedToPerson = (unit, personId) =>
    unit.members.some((member) =>
      directlyRelatedAsSiblings(member.id, personId),
    );
  const orderGenerationUnits = (units) => {
    const remaining = new Set(units.map((unit) => unit.id));
    const ordered = [];
    while (remaining.size) {
      const available = units.filter((unit) => remaining.has(unit.id));
      const anchor =
        available.find((unit) => unit.members.length === 2) || available[0];
      const left = anchor.members[0]
        ? available.filter(
            (unit) =>
              unit.id !== anchor.id &&
              unitRelatedToPerson(unit, anchor.members[0].id),
          )
        : [];
      const leftIds = new Set(left.map((unit) => unit.id));
      const right = anchor.members[1]
        ? available.filter(
            (unit) =>
              unit.id !== anchor.id &&
              !leftIds.has(unit.id) &&
              unitRelatedToPerson(unit, anchor.members[1].id),
          )
        : [];
      [...left, anchor, ...right].forEach((unit) => {
        if (!remaining.has(unit.id)) return;
        ordered.push(unit);
        remaining.delete(unit.id);
      });
    }
    return ordered;
  };
  const traditionalRows = Object.entries(
    traditionalUnits.reduce((rows, unit) => {
      rows[unit.level] ||= [];
      rows[unit.level].push(unit);
      return rows;
    }, {}),
  )
    .map(([level, units]) => ({
      level: Number(level),
      units: orderGenerationUnits(units),
    }))
    .sort((a, b) => a.level - b.level);
  const traditionalEdges = [];
  const traditionalEdgeKeys = new Set();
  traditionalUnits.forEach((childUnit) => {
    childUnit.members.forEach((child) => {
      displayParents.get(child.id)?.forEach((parentId) => {
        const parentUnitId = assignedUnit.get(parentId);
        if (!parentUnitId || parentUnitId === childUnit.id) return;
        const key = `parent:${parentUnitId}:${childUnit.id}`;
        if (traditionalEdgeKeys.has(key)) return;
        traditionalEdgeKeys.add(key);
        traditionalEdges.push({
          key,
          from: parentUnitId,
          to: childUnit.id,
          kind: "parent",
        });
      });
    });
  });
  relationships
    .filter((relationship) => ["spouse", "partner"].includes(relationship.type))
    .forEach((relationship) => {
      const from = assignedUnit.get(relationship.from);
      const to = assignedUnit.get(relationship.to);
      if (!from || !to || from === to) return;
      const pair = [from, to].sort();
      const key = `partner:${pair[0]}:${pair[1]}`;
      if (traditionalEdgeKeys.has(key)) return;
      traditionalEdgeKeys.add(key);
      traditionalEdges.push({ key, from, to, kind: "partner" });
    });
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
        const paths = measuredEdges.flatMap((edge) => {
          const parent = traditionalUnitRefs.current.get(edge.from);
          const child = traditionalUnitRefs.current.get(edge.to);
          if (!parent || !child) return [];
          const parentRect = parent.getBoundingClientRect();
          const childRect = child.getBoundingClientRect();
          if (edge.kind === "partner") {
            const fromX =
              parentRect.left + parentRect.width / 2 - canvasRect.left;
            const fromY =
              parentRect.top + parentRect.height / 2 - canvasRect.top;
            const toX =
              childRect.left + childRect.width / 2 - canvasRect.left;
            const toY =
              childRect.top + childRect.height / 2 - canvasRect.top;
            return [
              {
                key: edge.key,
                kind: "partner",
                d: `M ${fromX} ${fromY} L ${toX} ${toY}`,
              },
            ];
          }
          const fromX =
            parentRect.left + parentRect.width / 2 - canvasRect.left;
          const fromY = parentRect.bottom - canvasRect.top;
          const toX = childRect.left + childRect.width / 2 - canvasRect.left;
          const toY = childRect.top - canvasRect.top;
          const middleY = fromY + (toY - fromY) / 2;
          return [
            {
              key: edge.key,
              kind: "parent",
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
    window.addEventListener("resize", updateLines);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updateLines);
    };
  }, [people, relationships, traditionalEdgesJson, view]);
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
  const renderTreePerson = (person, index, unitLength) => (
    <div
      className={`traditional-person ${person.isPlaceholder ? "placeholder-person" : ""}`}
      key={person.id}
    >
      <button
        type="button"
        className="tree-person-edit"
        onClick={() => (person.canEdit || person.canSuggest) && editPerson(person)}
        disabled={!person.canEdit && !person.canSuggest}
        title={
          person.canEdit
            ? `Edit ${person.name}`
            : person.canSuggest
              ? `Suggest a correction for ${person.name}`
              : person.name
        }
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
        {(person.canEdit || person.canSuggest) && (
          <small className="edit-hint">
            {person.canEdit ? "Tap to edit details" : "Tap to suggest a correction"}
          </small>
        )}
      </button>
      <button
        onClick={() => addRelative(person)}
        title={`Add relative to ${person.firstName}`}
      >
        <Plus size={12} /> Add
      </button>
      {!person.isPlaceholder && (
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
          <h1>Your family, connected</h1>
          <p>
            Tap a person to edit their details, or use + to add someone directly
            around them.
          </p>
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
      <button className="link-existing-button" onClick={openLinkPeople}>
        <Link2 size={15} /> Link existing people
      </button>
      <div className="tree-help">
        <GitFork size={18} />
        <span>
          <strong>Build with familiar terms</strong>For Chacha, tap your father
          and choose Brother. For Dadi, tap your father and choose Mother. For
          Chachi, tap your uncle and choose Wife.
        </span>
      </div>
      {view === "traditional" && (
        <section className="traditional-tree">
          <div className="traditional-canvas" ref={traditionalCanvasRef}>
            <svg
              className="traditional-connectors"
              width={traditionalLines.width}
              height={traditionalLines.height}
              viewBox={`0 0 ${traditionalLines.width || 1} ${traditionalLines.height || 1}`}
              aria-hidden="true"
            >
              {traditionalLines.paths.map((path) => (
                <path key={path.key} d={path.d} className={path.kind === "partner" ? "partner-line" : ""} />
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
            <div className="family-map">
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
                      className={
                        ["spouse", "partner"].includes(rel.type)
                          ? "spouse"
                          : rel.type.includes("cousin")
                            ? "cousin"
                            : rel.type
                      }
                    />
                  );
                })}
              </svg>
              {networkPeople
                .filter((person) => positions[person.id])
                .map((person) => (
                  <div
                    className={`map-person ${person.isPlaceholder ? "placeholder-person" : ""}`}
                    style={{
                      left: `${positions[person.id][0]}%`,
                      top: `${positions[person.id][1]}%`,
                    }}
                    key={person.id}
                  >
                    <button
                      type="button"
                      className="map-person-edit"
                      onClick={() =>
                        (person.canEdit || person.canSuggest) && editPerson(person)
                      }
                      disabled={!person.canEdit && !person.canSuggest}
                      title={
                        person.canEdit
                          ? `Edit ${person.name}`
                          : person.canSuggest
                            ? `Suggest a correction for ${person.name}`
                            : person.name
                      }
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
                    </button>
                    <button
                      className="map-add"
                      onClick={() => addRelative(person)}
                      title={`Add a relative connected to ${person.firstName}`}
                    >
                      <Plus size={13} />
                    </button>
                    {!person.isPlaceholder && (
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
  connect,
  requestIdentity,
  dismissIdentity,
  respondInbox,
}) {
  const [reviewingFamily, setReviewingFamily] = useState(null);
  const [reviewingIdentity, setReviewingIdentity] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const incoming = inbox.filter(
    (item) => item.direction === "incoming" && item.status === "pending",
  );
  const activity = inbox.filter(
    (item) => !(item.direction === "incoming" && item.status === "pending"),
  );

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
          <div className="review-modal">
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
          <div className="review-modal">
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

function InviteModal({ person, close }) {
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState("connection");
  const [counts, setCounts] = useState({
    connection: null,
    immediate: null,
    extended: null,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc("preview_family_invitation_scope", {
        p_person_id: person.id,
        p_scope: "connection",
      }),
      supabase.rpc("preview_family_invitation_scope", {
        p_person_id: person.id,
        p_scope: "immediate",
      }),
      supabase.rpc("preview_family_invitation_scope", {
        p_person_id: person.id,
        p_scope: "extended",
      }),
    ]).then(([connection, immediate, extended]) => {
      if (active)
        setCounts({
          connection: connection.data,
          immediate: immediate.data,
          extended: extended.data,
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
    setSending(false);
  };

  return (
    <div className="modal-wrap">
      <button className="modal-scrim" onClick={close} />
      <form className="add-modal invite-modal" onSubmit={submit}>
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
                    Shares {counts.connection ?? "…"} people along your known
                    connection path, plus siblings around each connecting
                    generation. Spouse branches stay private.
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
                    Shares {counts.immediate ?? "…"} people through parent,
                    child, sibling and blood-family links. Spouse-family
                    branches stay private.
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
                    Shares {counts.extended ?? "…"} people, including spouse or
                    partner branches and their connected family.
                  </small>
                </span>
              </label>
            </fieldset>
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
      <form className="review-modal placeholder-modal" onSubmit={submit}>
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
      <form className="add-modal link-people-modal" onSubmit={submit}>
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
      <form className="add-modal merge-modal" onSubmit={submit}>
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
}) {
  const initialAnchor =
    anchor || people.find((item) => item.isSelf) || people[0] || null;
  const relationshipSuggestions = (anchorId, relationValue) => {
    const relation = RELATION_OPTIONS.find(
      (option) => option.value === relationValue,
    );
    const parents = relationships
      .filter((item) => item.type === "parent" && item.to === anchorId)
      .map((item) => item.from);
    const partners = relationships
      .filter(
        (item) =>
          ["spouse", "partner"].includes(item.type) &&
          (item.from === anchorId || item.to === anchorId),
      )
      .map((item) => (item.from === anchorId ? item.to : item.from));
    const suggestedParentIds =
      relation?.type === "sibling"
        ? parents
        : relation?.direction === "from-anchor"
          ? partners
          : [];
    const suggestedSpouseId =
      relation?.type === "parent" && relation?.direction === "to-anchor"
        ? parents[0] || ""
        : "";
    return { suggestedParentIds, suggestedSpouseId };
  };
  const initialSuggestions = relationshipSuggestions(
    initialAnchor?.id,
    "father",
  );
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: person?.firstName || "",
    nickname: person?.nickname || "",
    surname: person?.surname || "",
    maidenName: person?.maidenName || "",
    birthDate: person?.birthDate || "",
    birthYear: person?.birthYear || "",
    birthLocation: person?.birthLocation || null,
    livedLocations: person?.livedLocations || [],
    relation: "father",
    anchorId: initialAnchor?.id || "",
    gender: person?.gender || "unspecified",
    side: person?.side || anchor?.side || "Mother's side",
    parentIds: initialSuggestions.suggestedParentIds,
    spouseMode: initialSuggestions.suggestedSpouseId ? "existing" : "none",
    spouseId: initialSuggestions.suggestedSpouseId,
    newSpouseName: "",
    spouseIsParent: true,
    marriageYear: "",
    parentVariant: "biological",
    partnershipVariant: "current",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const updateRelation = (event) => {
    const relation = RELATION_OPTIONS.find(
      (option) => option.value === event.target.value,
    );
    setForm((current) => {
      const suggestions = relationshipSuggestions(
        current.anchorId,
        relation.value,
      );
      return {
        ...current,
        relation: relation.value,
        gender: relation.gender,
        side:
          relation.value === "father"
            ? "Father's side"
            : relation.value === "mother"
              ? "Mother's side"
              : current.side,
        parentIds: suggestions.suggestedParentIds,
        spouseMode: suggestions.suggestedSpouseId ? "existing" : "none",
        spouseId: suggestions.suggestedSpouseId,
      };
    });
  };
  const updateAnchor = (event) => {
    const anchorId = event.target.value;
    const suggestions = relationshipSuggestions(anchorId, form.relation);
    setForm((current) => ({
      ...current,
      anchorId,
      parentIds: suggestions.suggestedParentIds,
      spouseMode: suggestions.suggestedSpouseId ? "existing" : "none",
      spouseId: suggestions.suggestedSpouseId,
    }));
  };
  const anchorPerson =
    people.find((item) => item.id === form.anchorId) || anchor;
  const selectedRelation = RELATION_OPTIONS.find(
    (option) => option.value === form.relation,
  );
  const suggestedLinks = relationshipSuggestions(form.anchorId, form.relation);
  const spouseOptions = people.filter(
    (item) =>
      item.id !== form.anchorId && item.ownerId === anchorPerson?.ownerId,
  );
  const submit = async (e) => {
    e.preventDefault();
    if (step === 1) return setStep(2);
    setSaving(true);
    setError("");
    setDuplicateCandidates([]);
    try {
      const result = await savePerson(form, person);
      if (result?.duplicates?.length) {
        setDuplicateCandidates(result.duplicates);
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
      <form className="add-modal" onSubmit={submit}>
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
              : "Choose a direct relationship to an existing person so Vansh can place them accurately."
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
                  placeholder="e.g. Vaswani"
                />
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
              {person ? (
                <label>
                  Gender wording <small>Optional</small>
                  <select name="gender" value={form.gender} onChange={update}>
                    <option value="unspecified">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="nonbinary">Non-binary</option>
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    Related directly to
                    <select
                      name="anchorId"
                      value={form.anchorId}
                      onChange={updateAnchor}
                    >
                      {people.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    Their relationship to{" "}
                    {anchorPerson?.firstName || "this person"}
                    <select
                      name="relation"
                      value={form.relation}
                      onChange={updateRelation}
                    >
                      {RELATION_OPTIONS.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                          {option.term ? ` (${option.term})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedRelation?.type === "parent" && (
                    <label className="wide">
                      Parent relationship type
                      <select
                        value={form.parentVariant}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            parentVariant: event.target.value,
                          }))
                        }
                      >
                        <option value="biological">Biological parent</option>
                        <option value="adoptive">Adoptive parent</option>
                        <option value="step">Step-parent</option>
                        <option value="guardian">Guardian / social parent</option>
                        <option value="unspecified">Not specified</option>
                      </select>
                    </label>
                  )}
                  {["spouse", "partner"].includes(selectedRelation?.type) && (
                    <label className="wide">
                      Year{" "}
                      {selectedRelation.type === "spouse"
                        ? "married"
                        : "partnership began"}{" "}
                      <small>Optional</small>
                      <input
                        inputMode="numeric"
                        value={form.marriageYear}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            marriageYear: event.target.value,
                          }))
                        }
                        placeholder="e.g. 1968"
                      />
                    </label>
                  )}
                  {["spouse", "partner"].includes(selectedRelation?.type) && (
                    <label className="wide">
                      Relationship status
                      <select
                        value={form.partnershipVariant}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            partnershipVariant: event.target.value,
                          }))
                        }
                      >
                        <option value="current">Current</option>
                        <option value="former">Former</option>
                        <option value="unspecified">Not specified</option>
                      </select>
                    </label>
                  )}
                  {suggestedLinks.suggestedParentIds.length > 0 && (
                    <fieldset className="suggested-links wide">
                      <legend>
                        {selectedRelation?.type === "sibling"
                          ? "Which parent(s) do they share?"
                          : "Suggested parent links"}
                      </legend>
                      <p>
                        {selectedRelation?.type === "sibling"
                          ? "Select one shared parent for a half-sibling or two/more shared parents for a full sibling. Vansh derives sibling type from these parent links."
                          : `Known partners of ${anchorPerson?.firstName || "this person"} are suggested as additional parents.`}
                      </p>
                      {suggestedLinks.suggestedParentIds.map((parentId) => {
                        const parent = people.find(
                          (item) => item.id === parentId,
                        );
                        return (
                          <label key={parentId}>
                            <input
                              type="checkbox"
                              checked={form.parentIds.includes(parentId)}
                              onChange={() =>
                                setForm((current) => ({
                                  ...current,
                                  parentIds: current.parentIds.includes(
                                    parentId,
                                  )
                                    ? current.parentIds.filter(
                                        (id) => id !== parentId,
                                      )
                                    : [...current.parentIds, parentId],
                                }))
                              }
                            />
                            <span>
                              <strong>{parent?.name}</strong>
                              <small>Also link as parent</small>
                            </span>
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                  {!["spouse", "partner"].includes(selectedRelation?.type) && (
                    <fieldset className="relationship-bundle wide">
                      <legend>
                        Spouse or partner <small>Optional</small>
                      </legend>
                      <select
                        value={
                          form.spouseMode === "new"
                            ? "new"
                            : form.spouseMode === "existing"
                              ? form.spouseId
                              : "none"
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          setForm((current) => ({
                            ...current,
                            spouseMode:
                              value === "none"
                                ? "none"
                                : value === "new"
                                  ? "new"
                                  : "existing",
                            spouseId: !["none", "new"].includes(value)
                              ? value
                              : "",
                          }));
                        }}
                      >
                        <option value="none">No spouse to link now</option>
                        {spouseOptions.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                            {item.id === suggestedLinks.suggestedSpouseId
                              ? " (suggested co-parent)"
                              : ""}
                          </option>
                        ))}
                        <option value="new">Create a name-only spouse…</option>
                      </select>
                      {form.spouseMode === "new" && (
                        <input
                          required
                          value={form.newSpouseName}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              newSpouseName: event.target.value,
                            }))
                          }
                          placeholder="Spouse's full name"
                        />
                      )}
                      {form.spouseMode !== "none" && (
                        <div className="relationship-extras">
                          <label>
                            Year married <small>Optional</small>
                            <input
                              inputMode="numeric"
                              value={form.marriageYear}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  marriageYear: event.target.value,
                                }))
                              }
                              placeholder="e.g. 1968"
                            />
                          </label>
                          {form.spouseMode === "new" &&
                            selectedRelation?.type === "parent" &&
                            selectedRelation?.direction === "to-anchor" && (
                              <label className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={form.spouseIsParent}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      spouseIsParent: event.target.checked,
                                    }))
                                  }
                                />
                                Also link this spouse as a parent of{" "}
                                {anchorPerson?.firstName}
                              </label>
                            )}
                        </div>
                      )}
                    </fieldset>
                  )}
                </>
              )}
            </div>
            {!person && (
              <div className="kinship-tip">
                <GitFork size={17} />
                <span>
                  <strong>
                    {selectedRelation?.label}
                    {selectedRelation?.term
                      ? ` · ${selectedRelation.term}`
                      : ""}
                  </strong>
                  For Chacha or Taya, add a Brother from your father’s node. For
                  Dadi, add a Mother from your father’s node. For Chachi, add a
                  Wife from your uncle’s node.
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
            <label>
              Family branch
              <select name="side" value={form.side} onChange={update}>
                <option>You</option>
                <option>Mother's side</option>
                <option>Father's side</option>
                <option>Partner's side</option>
                <option>Other</option>
              </select>
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
                  disabled={saving}
                  onClick={() => resolveDuplicate(candidate.id)}
                >
                  Use existing
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
  const [page, setPage] = useState("home");
  const [people, setPeople] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [matches, setMatches] = useState([]);
  const [identityCandidates, setIdentityCandidates] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [placeholdersFor, setPlaceholdersFor] = useState(null);
  const [linkingPeople, setLinkingPeople] = useState(false);
  const [mergingPeople, setMergingPeople] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
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
      if (!rows.length && session.user.user_metadata.family_surname) {
        const parts = (profileResult.data.display_name || "")
          .trim()
          .split(/\s+/);
        const selfResult = await supabase
          .from("family_members")
          .insert({
            owner_id: session.user.id,
            created_by: session.user.id,
            linked_user_id: session.user.id,
            first_name: profileResult.data.first_name || parts[0] || "Me",
            surname: profileResult.data.surname || session.user.user_metadata.family_surname,
            birth_date: profileResult.data.birth_date || null,
            birth_year: profileResult.data.birth_date
              ? Number(profileResult.data.birth_date.slice(0, 4))
              : null,
            birth_place: profileResult.data.birth_location_text || null,
            lived_in:
              profileResult.data.current_location_text ||
              profileResult.data.location ||
              null,
            family_side: "You",
            is_self: true,
          })
          .select()
          .single();
        if (selfResult.error) {
          if (active) {
            setDataError(selfResult.error.message);
            setLoading(false);
          }
          return;
        }
        rows = [selfResult.data];
      }
      const [matchResult, identityResult, inboxResult] = await Promise.all([
        supabase.rpc("find_family_matches"),
        supabase.rpc("find_identity_claim_candidates"),
        supabase.rpc("get_verification_inbox"),
      ]);
      if (!active) return;
      setProfile(profileResult.data);
      setPeople(
        rows.map((row, index) => personFromRow(row, index, session.user.id)),
      );
      setRelationships(
        relationshipsResult.data.map((row) => ({
          id: row.id,
          from: row.person_a_id,
          to: row.person_b_id,
          type: row.relationship_type,
          variant: row.relationship_variant || "unspecified",
          startYear: row.start_year,
          endYear: row.end_year,
        })),
      );
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
      setLoading(false);
    };
    loadFamily();
    return () => {
      active = false;
    };
  }, [session.user.id, session.user.user_metadata.family_surname]);

  const refreshTrustData = async () => {
    const [matchResult, identityResult, inboxResult] = await Promise.all([
      supabase.rpc("find_family_matches"),
      supabase.rpc("find_identity_claim_candidates"),
      supabase.rpc("get_verification_inbox"),
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
  };

  const refreshFamilyData = async () => {
    const [peopleResult, relationshipsResult] = await Promise.all([
      supabase.from("family_members").select("*").order("created_at"),
      supabase.from("relationships").select("*").order("created_at"),
    ]);
    if (peopleResult.error) throw peopleResult.error;
    if (relationshipsResult.error) throw relationshipsResult.error;
    setPeople(
      peopleResult.data.map((row, index) =>
        personFromRow(row, index, session.user.id),
      ),
    );
    setRelationships(
      relationshipsResult.data.map((row) => ({
        id: row.id,
        from: row.person_a_id,
        to: row.person_b_id,
        type: row.relationship_type,
        variant: row.relationship_variant || "unspecified",
        startYear: row.start_year,
        endYear: row.end_year,
      })),
    );
    await refreshTrustData();
  };

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

    const today = new Date();
    const currentYear = today.getFullYear();
    if (form.birthDate) {
      const parsedBirthDate = new Date(`${form.birthDate}T00:00:00`);
      if (
        Number.isNaN(parsedBirthDate.getTime()) ||
        parsedBirthDate.getFullYear() < 1800 ||
        parsedBirthDate > today
      )
        throw new Error("Enter a valid date of birth.");
    }
    const effectiveBirthYear = form.birthDate
      ? Number(form.birthDate.slice(0, 4))
      : form.birthYear
        ? Number(form.birthYear)
        : null;
    if (
      effectiveBirthYear &&
      (!/^\d{4}$/.test(String(effectiveBirthYear)) ||
        effectiveBirthYear < 1800 ||
        effectiveBirthYear > currentYear)
    )
      throw new Error("Enter a valid four-digit birth year.");

    if (
      form.marriageYear &&
      (!/^\d{4}$/.test(form.marriageYear) ||
        Number(form.marriageYear) < 1800 ||
        Number(form.marriageYear) > currentYear)
    )
      throw new Error("Enter a valid four-digit marriage year.");

    const livedLocations = form.livedLocations.map((location) => {
      const startYear = location.startYear ? Number(location.startYear) : null;
      const endYear = location.endYear ? Number(location.endYear) : null;
      for (const [label, value] of [
        ["From", location.startYear],
        ["To", location.endYear],
      ]) {
        if (
          value &&
          (!/^\d{4}$/.test(String(value)) ||
            Number(value) < 1800 ||
            Number(value) > currentYear)
        )
          throw new Error(
            `${label} year for ${location.display} must be a valid four-digit year.`,
          );
      }
      if (startYear && endYear && startYear > endYear)
        throw new Error(
          `The From year for ${location.display} cannot be after its To year.`,
        );
      return { ...location, startYear, endYear };
    });

    const payload = {
      owner_id:
        existing?.ownerId ||
        anchorPerson?.ownerId ||
        self.ownerId ||
        session.user.id,
      first_name: form.firstName.trim(),
      surname: form.surname.trim(),
      nickname: form.nickname.trim() || null,
      maiden_name: form.maidenName.trim() || null,
      gender: form.gender,
      birth_date: form.birthDate || null,
      birth_year: effectiveBirthYear,
      birth_location: form.birthLocation,
      lived_locations: livedLocations,
      birth_place:
        form.birthLocation?.display || existing?.legacyBirthPlace || null,
      lived_in: livedLocations[0]?.display || existing?.legacyLivedIn || null,
      family_side: form.side,
    };

    if (!payload.first_name || !payload.surname)
      throw new Error("First name and surname are required.");

    // Claimed people control their own identity fields. Other relatives can
    // propose changes, but cannot overwrite those fields directly.
    if (existing?.canSuggest) {
      const proposed = {
        first_name: payload.first_name,
        surname: payload.surname,
        nickname: payload.nickname,
        maiden_name: payload.maiden_name,
        gender: payload.gender,
        birth_date: payload.birth_date,
        birth_year: payload.birth_year,
        birth_location: payload.birth_location,
        lived_locations: payload.lived_locations,
        birth_place: payload.birth_place,
        lived_in: payload.lived_in,
      };
      const current = {
        first_name: existing.firstName,
        surname: existing.surname,
        nickname: existing.nickname || null,
        maiden_name: existing.maidenName || null,
        gender: existing.gender,
        birth_date: existing.birthDate || null,
        birth_year: existing.birthYear ? Number(existing.birthYear) : null,
        birth_location: existing.birthLocation,
        lived_locations: existing.livedLocations,
        birth_place: existing.birthPlace || null,
        lived_in: existing.livedLocations?.[0]?.display || existing.legacyLivedIn || null,
      };
      const changes = Object.fromEntries(
        Object.entries(proposed).filter(
          ([key, value]) =>
            JSON.stringify(value ?? null) !== JSON.stringify(current[key] ?? null),
        ),
      );
      if (!Object.keys(changes).length) return { suggested: false };
      const suggestion = await supabase.rpc("suggest_member_correction", {
        p_member_id: existing.id,
        p_changes: changes,
      });
      if (suggestion.error) throw suggestion.error;
      await refreshTrustData();
      return { suggested: true };
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

    const relation = !existing
      ? RELATION_OPTIONS.find((option) => option.value === form.relation)
      : null;
    if (!existing && !relation) throw new Error("Choose a relationship.");

    const createRelationshipBundle = async (memberId) => {
      let spouseMember = null;
      if (form.spouseMode === "new") {
        const nameParts = form.newSpouseName
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        if (!nameParts.length) throw new Error("Enter the spouse's name.");
        const spouseResult = await supabase
          .from("family_members")
          .insert({
            owner_id: anchorPerson.ownerId,
            created_by: session.user.id,
            first_name:
              nameParts.length > 1
                ? nameParts.slice(0, -1).join(" ")
                : nameParts[0],
            surname:
              nameParts.length > 1 ? nameParts.at(-1) : payload.surname,
            family_side: form.side,
            gender: "unspecified",
          })
          .select()
          .single();
        if (spouseResult.error) throw spouseResult.error;
        spouseMember = spouseResult.data;
      }

      const rows = [];
      const pushRelationship = (row) => {
        const symmetric = ["sibling", "spouse", "partner"].includes(
          row.relationship_type,
        );
        const alreadyExists = relationships.some(
          (item) =>
            item.type === row.relationship_type &&
            ((item.from === row.person_a_id && item.to === row.person_b_id) ||
              (symmetric &&
                item.from === row.person_b_id &&
                item.to === row.person_a_id)),
        );
        const alreadyQueued = rows.some(
          (item) =>
            item.relationship_type === row.relationship_type &&
            ((item.person_a_id === row.person_a_id &&
              item.person_b_id === row.person_b_id) ||
              (symmetric &&
                item.person_a_id === row.person_b_id &&
                item.person_b_id === row.person_a_id)),
        );
        if (!alreadyExists && !alreadyQueued) rows.push(row);
      };

      const base = {
        owner_id: anchorPerson.ownerId,
        created_by: session.user.id,
      };

      if (relation.type === "sibling") {
        const knownParents = parentIdsFor(anchorPerson.id, relationships);
        if (knownParents.length && !form.parentIds.length)
          throw new Error(
            "Choose at least one shared parent. One shared parent creates a half-sibling relationship; two or more creates a full-sibling relationship.",
          );
        if (!form.parentIds.length) {
          pushRelationship({
            ...base,
            person_a_id: memberId,
            person_b_id: anchorPerson.id,
            relationship_type: "sibling",
            relationship_variant: "reported",
            start_year: null,
          });
        }
      } else {
        const personAId =
          relation.direction === "from-anchor" ? anchorPerson.id : memberId;
        const personBId =
          relation.direction === "from-anchor" ? memberId : anchorPerson.id;
        pushRelationship({
          ...base,
          person_a_id: personAId,
          person_b_id: personBId,
          relationship_type: relation.type,
          relationship_variant:
            relation.type === "parent"
              ? form.parentVariant || "biological"
              : ["spouse", "partner"].includes(relation.type)
                ? form.partnershipVariant || "current"
                : "unspecified",
          start_year:
            ["spouse", "partner"].includes(relation.type) && form.marriageYear
              ? Number(form.marriageYear)
              : null,
        });
      }

      form.parentIds.forEach((parentId) => {
        const anchorParent = relationships.find(
          (item) =>
            item.type === "parent" &&
            item.from === parentId &&
            item.to === anchorPerson.id,
        );
        pushRelationship({
          ...base,
          person_a_id: parentId,
          person_b_id: memberId,
          relationship_type: "parent",
          relationship_variant: anchorParent?.variant || "biological",
          start_year: null,
        });
      });

      const spouseId =
        form.spouseMode === "existing" ? form.spouseId : spouseMember?.id;
      if (spouseId) {
        pushRelationship({
          ...base,
          person_a_id: memberId,
          person_b_id: spouseId,
          relationship_type: "spouse",
          relationship_variant: form.partnershipVariant || "current",
          start_year: form.marriageYear ? Number(form.marriageYear) : null,
        });
        if (
          spouseMember &&
          form.spouseIsParent &&
          relation.type === "parent" &&
          relation.direction === "to-anchor"
        ) {
          pushRelationship({
            ...base,
            person_a_id: spouseMember.id,
            person_b_id: anchorPerson.id,
            relationship_type: "parent",
            relationship_variant: form.parentVariant || "biological",
            start_year: null,
          });
        }
      }

      if (rows.length) {
        const relationshipResult = await supabase
          .from("relationships")
          .insert(rows)
          .select();
        if (relationshipResult.error) throw relationshipResult.error;
      }
      return spouseMember;
    };

    if (existing) {
      if (existing.isPlaceholder) {
        payload.is_placeholder = false;
        payload.placeholder_label = null;
        payload.filled_by = session.user.id;
      }
      const memberResult = await supabase
        .from("family_members")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (memberResult.error) throw memberResult.error;
      await refreshFamilyData();
      return { updated: true };
    }

    if (options.useExistingId) {
      const duplicate = people.find(
        (person) =>
          person.id === options.useExistingId &&
          person.ownerId === anchorPerson.ownerId,
      );
      if (!duplicate)
        throw new Error("That existing record is no longer available.");
      await createRelationshipBundle(duplicate.id);
      await refreshFamilyData();
      return { reused: true };
    }

    const memberResult = await supabase
      .from("family_members")
      .insert({ ...payload, created_by: session.user.id })
      .select()
      .single();
    if (memberResult.error) throw memberResult.error;

    try {
      await createRelationshipBundle(memberResult.data.id);
    } catch (relationshipError) {
      await supabase.from("family_members").delete().eq("id", memberResult.data.id);
      throw relationshipError;
    }

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
    await refreshTrustData();
  };

  const requestIdentity = async (candidate) => {
    const result = await supabase.rpc("request_identity_claim", {
      p_candidate_member_id: candidate.id,
    });
    if (result.error) throw result.error;
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
        : await supabase.rpc("respond_verification_request", {
            p_kind: item.kind,
            p_request_id: item.request_id,
            p_accept: accept,
          });
    if (result.error) throw result.error;
    await refreshFamilyData();
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
  const addPlaceholders = async (anchor, totalCount) => {
    const siblingIds = new Set(
      siblingDetailsFor(anchor.id, relationships).map((sibling) => sibling.id),
    );
    const missingCount = Math.max(0, totalCount - siblingIds.size);
    if (!missingCount) return;
    const existingPlaceholderCount = [...siblingIds].filter((personId) =>
      people.some((person) => person.id === personId && person.isPlaceholder),
    ).length;
    const rows = Array.from({ length: missingCount }, (_, index) => ({
      owner_id: anchor.ownerId,
      created_by: session.user.id,
      first_name: "Unknown",
      surname: anchor.surname || "Unknown",
      family_side: anchor.side,
      gender: "unspecified",
      is_placeholder: true,
      placeholder_label: `Unknown sibling ${existingPlaceholderCount + index + 1}`,
    }));
    const memberResult = await supabase
      .from("family_members")
      .insert(rows)
      .select();
    if (memberResult.error) throw memberResult.error;
    const relationshipResult = await supabase
      .from("relationships")
      .insert(
        memberResult.data.map((member) => ({
          owner_id: anchor.ownerId,
          created_by: session.user.id,
          person_a_id: member.id,
          person_b_id: anchor.id,
          relationship_type: "sibling",
          relationship_variant: "reported",
        })),
      )
      .select();
    if (relationshipResult.error) {
      await supabase
        .from("family_members")
        .delete()
        .in(
          "id",
          memberResult.data.map((member) => member.id),
        );
      throw relationshipResult.error;
    }
    setPeople((current) => [
      ...current,
      ...memberResult.data.map((row, index) =>
        personFromRow(row, current.length + index, session.user.id),
      ),
    ]);
    setRelationships((current) => [
      ...current,
      ...relationshipResult.data.map((relationship) => ({
        id: relationship.id,
        from: relationship.person_a_id,
        to: relationship.person_b_id,
        type: relationship.relationship_type,
        variant: relationship.relationship_variant || "unspecified",
        startYear: relationship.start_year,
        endYear: relationship.end_year,
      })),
    ]);
  };
  const linkPeople = async (
    personA,
    personB,
    relation,
    startYear = "",
    variant = "unspecified",
    sharedParentIds = [],
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

    const base = {
      owner_id: personA.ownerId,
      created_by: session.user.id,
    };
    const rows = [];

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
              rows.push({
                ...base,
                person_a_id: parentId,
                person_b_id: childId,
                relationship_type: "parent",
                relationship_variant:
                  relationships.find(
                    (item) =>
                      item.type === "parent" &&
                      item.from === parentId &&
                      [personA.id, personB.id].includes(item.to),
                  )?.variant || "biological",
                start_year: null,
              });
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
        rows.push({
          ...base,
          person_a_id: personA.id,
          person_b_id: personB.id,
          relationship_type: "sibling",
          relationship_variant: "reported",
          start_year: null,
        });
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
      rows.push({
        ...base,
        person_a_id: from,
        person_b_id: to,
        relationship_type: type,
        relationship_variant:
          type === "parent"
            ? variant || "biological"
            : ["spouse", "partner"].includes(type)
              ? variant || "current"
              : "unspecified",
        start_year:
          ["spouse", "partner"].includes(type) && startYear
            ? Number(startYear)
            : null,
      });
    }

    if (!rows.length)
      throw new Error(
        "Those people are already connected through the selected parent relationship.",
      );

    const result = await supabase.from("relationships").insert(rows).select();
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
    const result = await supabase
      .from("family_members")
      .delete()
      .eq("id", person.id);
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
  const filtered = query
    ? people.filter((person) =>
        `${person.name} ${person.maidenName} ${person.birthPlace} ${person.livedIn}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : null;
  if (loading)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        <strong>Opening your family space</strong>
      </div>
    );
  const notificationCount = inbox.filter(
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
        />
        {filtered ? (
          <div className="page search-results">
            <span className="eyebrow">SEARCH RESULTS</span>
            <h1>People matching “{query}”</h1>
            {filtered.length ? (
              <div className="people-grid">
                {filtered.map((person) => (
                  <article className="person-card" key={person.id}>
                    <Avatar person={person} />
                    <h3>{person.name}</h3>
                    <p>{person.birthPlace || "Place not recorded"}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty">
                <Search />
                <h3>No people found</h3>
                <p>Try a surname, city or family member's name.</p>
              </div>
            )}
          </div>
        ) : page === "home" ? (
          <Overview
            people={people}
            matches={matches}
            profile={profile}
            setPage={setPage}
            openAdd={() =>
              setAdding(people.find((person) => person.isSelf) || people[0])
            }
          />
        ) : page === "family" ? (
          <Family
            people={people}
            openAdd={() =>
              setAdding(people.find((person) => person.isSelf) || people[0])
            }
            editPerson={setEditing}
            deletePerson={deletePerson}
            invitePerson={setInviting}
            openMerge={() => setMergingPeople(true)}
          />
        ) : page === "tree" ? (
          <Tree
            people={people}
            relationships={relationships}
            addRelative={setAdding}
            addUnknownSiblings={setPlaceholdersFor}
            editPerson={setEditing}
            openLinkPeople={() => setLinkingPeople(true)}
          />
        ) : (
          <Connections
            matches={matches}
            identityCandidates={identityCandidates}
            inbox={inbox}
            connect={connect}
            requestIdentity={requestIdentity}
            dismissIdentity={dismissIdentity}
            respondInbox={respondInbox}
          />
        )}
      </main>
      {adding && (
        <PersonModal
          anchor={adding}
          people={people}
          relationships={relationships}
          close={() => setAdding(false)}
          savePerson={savePerson}
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
      {inviting && (
        <InviteModal person={inviting} close={() => setInviting(null)} />
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
      {showNotes && <PatchNotes close={() => setShowNotes(false)} />}
    </div>
  );
}

export default function App() {
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
  return session ? <FamilyApp session={session} /> : <AuthScreen />;
}
