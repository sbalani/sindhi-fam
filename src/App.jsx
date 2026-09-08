import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import { locationPoint } from "./locationUtils.js";

const WorldMap = lazy(() => import("./WorldMap.jsx"));

const nav = [
  { id: "home", label: "Overview", icon: LayoutDashboard },
  { id: "family", label: "My family", icon: UsersRound },
  { id: "tree", label: "Family map", icon: Network },
  { id: "places", label: "Places", icon: MapPin },
  { id: "matches", label: "Connections", icon: Sparkles, count: 3 },
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
    value: "half-brother",
    label: "Half-brother",
    term: "",
    type: "sibling",
    variant: "half",
    gender: "male",
    direction: "symmetric",
  },
  {
    value: "half-sister",
    label: "Half-sister",
    term: "",
    type: "sibling",
    variant: "half",
    gender: "female",
    direction: "symmetric",
  },
  {
    value: "adoptive-father",
    label: "Adoptive father",
    term: "",
    type: "parent",
    variant: "adoptive",
    gender: "male",
    direction: "to-anchor",
  },
  {
    value: "adoptive-mother",
    label: "Adoptive mother",
    term: "",
    type: "parent",
    variant: "adoptive",
    gender: "female",
    direction: "to-anchor",
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

const personFromRow = (row, index = 0, currentUserId = "") => ({
  id: row.id,
  firstName: row.is_placeholder
    ? row.placeholder_label || "Unknown relative"
    : row.first_name,
  surname: row.surname,
  nickname: row.nickname || "",
  maidenName: row.maiden_name || "",
  birthYear: row.birth_year?.toString() || "",
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
  isSelf:
    row.linked_user_id === currentUserId ||
    (row.is_self && row.owner_id === currentUserId),
  ownerId: row.owner_id,
  createdBy: row.created_by,
  linkedUserId: row.linked_user_id,
  isPlaceholder: row.is_placeholder,
  placeholderLabel: row.placeholder_label,
  filledBy: row.filled_by,
  canEdit:
    row.owner_id === currentUserId ||
    row.created_by === currentUserId ||
    row.linked_user_id === currentUserId ||
    row.filled_by === currentUserId ||
    row.is_placeholder,
  canDelete: !row.is_self && row.created_by === currentUserId,
  name: row.is_placeholder
    ? row.placeholder_label || "Unknown relative"
    : [row.first_name, row.nickname ? `"${row.nickname}"` : null, row.surname]
        .filter(Boolean)
        .join(" "),
  initials: row.is_placeholder
    ? "?"
    : `${row.first_name?.[0] || ""}${row.surname?.[0] || ""}`.toUpperCase(),
  color: colors[index % colors.length],
});

function AuthScreen() {
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({
    name: "",
    surname: "",
    location: "",
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
                display_name: form.name,
                family_surname: form.surname,
                location: form.location,
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
                Your name
                <input
                  required
                  name="name"
                  value={form.name}
                  onChange={update}
                  placeholder="First and last name"
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
              <label className="wide">
                Where do you live? <small>Optional</small>
                <input
                  name="location"
                  value={form.location}
                  onChange={update}
                  placeholder="City or country"
                />
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

function Sidebar({ page, setPage, open, close, people, openNotes }) {
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
          {nav.map(({ id, label, icon: Icon, count }) => (
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
              {count && <b>{count}</b>}
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
          Explore your private family places and record nuanced direct
          relationships without weakening the graph model.
        </p>
        <div className="release-list">
          <div>
            <Network />
            <span>
              <strong>Private Places map</strong>See mapped birthplaces and
              residences from records you already have permission to view.
            </span>
          </div>
          <div>
            <BookHeart />
            <span>
              <strong>Legacy place correction</strong>Find records that still
              need a structured city selection before they can be mapped.
            </span>
          </div>
          <div>
            <UserPlus />
            <span>
              <strong>Half-siblings</strong>Store the qualifier separately so a
              half-sibling remains connected without inferring shared parents.
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Adoptive parents</strong>Record adoptive parenthood as a
              direct qualified relationship in either add or link flows.
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

function Header({ setMenu, query, setQuery, profile, self, signOut }) {
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
      <button className="icon-button notification">
        <Bell size={19} />
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

function Places({ people, editPerson }) {
  const points = people.flatMap((person) => {
    const locations = [
      person.birthLocation
        ? { ...person.birthLocation, kind: "Birthplace" }
        : null,
      ...person.livedLocations.map((location) => ({
        ...location,
        kind: residencePeriod(location)
          ? `Residence · ${residencePeriod(location)}`
          : "Residence",
      })),
    ].filter(Boolean);
    return locations.flatMap((location) => {
      const point = locationPoint(location);
      return point
        ? [
            {
              ...point,
              label: location.display,
              detail: `${person.name} · ${location.kind}`,
            },
          ]
        : [];
    });
  });
  const unresolved = people.filter(
    (person) =>
      person.legacyBirthPlace ||
      person.legacyLivedIn ||
      (person.birthLocation && !locationPoint(person.birthLocation)) ||
      person.livedLocations.some((location) => !locationPoint(location)),
  );
  return (
    <div className="page inner-page places-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRIVATE FAMILY PLACES</span>
          <h1>Where your family story moved</h1>
          <p>
            Only places from family records you can already access appear here.
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="private-map-loading">
            <LoaderCircle className="spin" /> Loading family map
          </div>
        }
      >
        <WorldMap points={points} />
      </Suspense>
      <div className="places-summary">
        <strong>{points.length} mapped family locations</strong>
        <span>
          Birthplaces and residences remain private to the same people who can
          view each family record.
        </span>
      </div>
      {unresolved.length > 0 && (
        <section className="panel unresolved-places">
          <span className="mini-title">NEEDS LOCATION MATCHING</span>
          <h2>Finish matching older places</h2>
          <p>
            These records have free-text places or selections without map
            coordinates. Editing and selecting the city will place them safely.
          </p>
          <div>
            {unresolved.map((person) => (
              <button
                key={person.id}
                onClick={() => person.canEdit && editPerson(person)}
                disabled={!person.canEdit}
              >
                <Avatar person={person} size="small" />
                <span>
                  <strong>{person.name}</strong>
                  <small>
                    {[person.legacyBirthPlace, person.legacyLivedIn]
                      .filter(Boolean)
                      .join(" · ") || "Reselect a mapped city"}
                  </small>
                </span>
                {person.canEdit && <ArrowRight size={15} />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Family({ people, openAdd, editPerson, deletePerson, invitePerson }) {
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
        <button className="primary" onClick={openAdd}>
          <Plus size={18} /> Add family member
        </button>
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
                  : person.isSelf
                    ? "Your profile"
                    : person.ownerId === person.createdBy
                      ? "Family record"
                      : "Shared record"}
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
              ) : (
                <span>Live shared record</span>
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
      if (relationship.type !== "sibling" || relationship.variant === "half")
        return;
      const fromParents = displayParents.get(relationship.from);
      const toParents = displayParents.get(relationship.to);
      if (!fromParents || !toParents) return;
      if (!fromParents.size && toParents.size)
        toParents.forEach((parentId) => fromParents.add(parentId));
      if (!toParents.size && fromParents.size)
        fromParents.forEach((parentId) => toParents.add(parentId));
    });
  }
  const assignedUnit = new Map();
  const traditionalUnits = [];
  const addUnit = (memberIds) => {
    const members = memberIds
      .map((personId) => peopleById.get(personId))
      .filter(Boolean);
    if (!members.length) return;
    const id = memberIds.slice().sort().join("-");
    const unit = {
      id,
      members,
      level: Math.min(...members.map((person) => levels[person.id] ?? 0)),
    };
    traditionalUnits.push(unit);
    members.forEach((person) => assignedUnit.set(person.id, id));
  };
  relationships
    .filter((relationship) => ["spouse", "partner"].includes(relationship.type))
    .forEach((relationship) => {
      if (
        !assignedUnit.has(relationship.from) &&
        !assignedUnit.has(relationship.to)
      )
        addUnit([relationship.from, relationship.to]);
    });
  const explicitParentsByChild = new Map();
  relationships.forEach((relationship) => {
    if (relationship.type !== "parent") return;
    const parents = explicitParentsByChild.get(relationship.to) || [];
    parents.push(relationship.from);
    explicitParentsByChild.set(relationship.to, parents);
  });
  explicitParentsByChild.forEach((parentIds) => {
    if (
      parentIds.length > 1 &&
      !assignedUnit.has(parentIds[0]) &&
      !assignedUnit.has(parentIds[1])
    )
      addUnit(parentIds.slice(0, 2));
  });
  people.forEach((person) => {
    if (!assignedUnit.has(person.id)) addUnit([person.id]);
  });
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
        const key = `${parentUnitId}:${childUnit.id}`;
        if (traditionalEdgeKeys.has(key)) return;
        traditionalEdgeKeys.add(key);
        traditionalEdges.push({
          key,
          from: parentUnitId,
          to: childUnit.id,
        });
      });
    });
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
          const fromX =
            parentRect.left + parentRect.width / 2 - canvasRect.left;
          const fromY = parentRect.bottom - canvasRect.top;
          const toX = childRect.left + childRect.width / 2 - canvasRect.left;
          const toY = childRect.top - canvasRect.top;
          const middleY = fromY + (toY - fromY) / 2;
          return [
            {
              key: edge.key,
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
    const parentRelationships = relationships.filter(
      (item) => item.type === "parent" && item.to === person.id,
    );
    const childRelationships = relationships.filter(
      (item) => item.type === "parent" && item.from === person.id,
    );
    const siblingRelationships = relationships.filter(
      (item) =>
        item.type === "sibling" &&
        (item.from === person.id || item.to === person.id),
    );
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
      parentRelationships.some((item) => !item.variant)
        ? `Child of ${names(parentRelationships.filter((item) => !item.variant).map((item) => item.from))}`
        : null,
      parentRelationships.some((item) => item.variant === "adoptive")
        ? `Adoptive child of ${names(parentRelationships.filter((item) => item.variant === "adoptive").map((item) => item.from))}`
        : null,
      partners.length
        ? `Partner of ${names(partners)}${partnershipYear ? ` · married ${partnershipYear}` : ""}`
        : null,
      siblingRelationships.some((item) => !item.variant)
        ? `Sibling of ${names(siblingRelationships.filter((item) => !item.variant).map((item) => (item.from === person.id ? item.to : item.from)))}`
        : null,
      siblingRelationships.some((item) => item.variant === "half")
        ? `Half-sibling of ${names(siblingRelationships.filter((item) => item.variant === "half").map((item) => (item.from === person.id ? item.to : item.from)))}`
        : null,
      childRelationships.length
        ? `Parent of ${names(childRelationships.map((item) => item.to))}`
        : null,
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
        onClick={() => person.canEdit && editPerson(person)}
        disabled={!person.canEdit}
        title={person.canEdit ? `Edit ${person.name}` : person.name}
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
        {person.canEdit && (
          <small className="edit-hint">Tap to edit details</small>
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
                <path key={path.key} d={path.d} />
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
                      onClick={() => person.canEdit && editPerson(person)}
                      disabled={!person.canEdit}
                      title={
                        person.canEdit ? `Edit ${person.name}` : person.name
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

function Matches({ matches, connect }) {
  const [reviewing, setReviewing] = useState(null);
  return (
    <div className="page inner-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRIVATE SUGGESTIONS</span>
          <h1>Possible connections</h1>
          <p>Nothing is shared until both families choose to connect.</p>
        </div>
      </div>
      <div className="privacy-banner">
        <LockKeyhole size={22} />
        <div>
          <strong>You are in control</strong>
          <p>
            We show only broad matching details. Personal contact information
            stays hidden.
          </p>
        </div>
      </div>
      <div className="connection-grid">
        {matches.map((match) => (
          <article className="connection-card" key={match.id}>
            <div className="score-ring">
              <strong>{match.score}%</strong>
              <span>confidence</span>
            </div>
            <Avatar person={match} size="large" />
            <h2>{match.name}</h2>
            <p>{match.details}</p>
            <span className="relation-label">
              <GitFork size={15} /> Shared family details
            </span>
            <div className="why">
              <strong>Why we matched you</strong>
              {match.shared.map((item) => (
                <span key={item}>
                  <Check size={13} /> {item}
                </span>
              ))}
            </div>
            <button className="primary" onClick={() => setReviewing(match)}>
              Review connection
            </button>
          </article>
        ))}
      </div>
      {!matches.length && (
        <div className="panel empty large">
          <Sparkles size={28} />
          <h2>No suggestions yet</h2>
          <p>Add more relatives, surnames and places to find family threads.</p>
        </div>
      )}
      {reviewing && (
        <div className="modal-wrap">
          <button className="modal-scrim" onClick={() => setReviewing(null)} />
          <div className="review-modal">
            <button className="modal-close" onClick={() => setReviewing(null)}>
              <X />
            </button>
            <span className="mini-title">
              <ShieldCheck size={14} /> CONNECTION REVIEW
            </span>
            <Avatar person={reviewing} size="large" />
            <h2>Could {reviewing.name} be family?</h2>
            <p>
              Vansh found overlapping details in your private family records:
            </p>
            <div className="review-reasons">
              {reviewing.shared.map((x) => (
                <span key={x}>
                  <Check size={15} /> Shared {x}
                </span>
              ))}
            </div>
            <button
              className="primary"
              onClick={async () => {
                await connect(reviewing, "requested");
                setReviewing(null);
              }}
            >
              <HeartHandshake size={17} /> Send private connection request
            </button>
            <button
              className="quiet"
              onClick={async () => {
                await connect(reviewing, "dismissed");
                setReviewing(null);
              }}
            >
              Not a match
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
              their existing family record and {sent.sharedPeople} connected{" "}
              {sent.sharedPeople === 1 ? "person" : "people"} will appear
              automatically.
            </p>
            <button type="button" className="primary" onClick={close}>
              Close
            </button>
          </div>
        ) : (
          <>
            <h2>Invite {person.firstName} to Vansh</h2>
            <p>
              They will claim this existing person record. Shared details remain
              live and synchronized rather than creating a copy.
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

function LinkPeopleModal({ people, close, linkPeople }) {
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const personA = people.find((person) => person.id === personAId);
  const personB = people.find((person) => person.id === personBId);

  const changeFirstPerson = (event) => {
    const nextId = event.target.value;
    const nextPerson = people.find((person) => person.id === nextId);
    const nextAvailable = people.filter(
      (person) =>
        person.id !== nextId && person.ownerId === nextPerson?.ownerId,
    );
    setPersonAId(nextId);
    setPersonBId(nextAvailable[0]?.id || "");
  };
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await linkPeople(personA, personB, relation, marriageYear);
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
          Choose two records already in this family graph and describe their
          direct relationship.
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
              onChange={(event) => setPersonBId(event.target.value)}
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
            <select
              value={relation}
              onChange={(event) => setRelation(event.target.value)}
            >
              <option value="parent-a">
                {personA?.firstName || "First person"} is parent of{" "}
                {personB?.firstName || "second person"}
              </option>
              <option value="parent-b">
                {personB?.firstName || "Second person"} is parent of{" "}
                {personA?.firstName || "first person"}
              </option>
              <option value="adoptive-parent-a">
                {personA?.firstName || "First person"} is adoptive parent of{" "}
                {personB?.firstName || "second person"}
              </option>
              <option value="adoptive-parent-b">
                {personB?.firstName || "Second person"} is adoptive parent of{" "}
                {personA?.firstName || "first person"}
              </option>
              <option value="sibling">They are siblings</option>
              <option value="half-sibling">They are half-siblings</option>
              <option value="spouse">They are married / spouses</option>
              <option value="partner">They are partners</option>
            </select>
          </label>
          {["spouse", "partner"].includes(relation) && (
            <label className="wide">
              Year {relation === "spouse" ? "married" : "partnership began"}{" "}
              <small>Optional</small>
              <input
                inputMode="numeric"
                value={marriageYear}
                onChange={(event) => setMarriageYear(event.target.value)}
                placeholder="e.g. 1968"
              />
            </label>
          )}
        </div>
        <div className="invite-notice">
          <ShieldCheck size={17} />
          <span>
            <strong>Direct facts only</strong>
            Link two people only when this relationship itself is known. Vansh
            derives wider family paths from these direct facts.
          </span>
        </div>
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
      relation?.type === "sibling" && !relation.variant
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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
    try {
      await savePerson(form, person);
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
          {person ? "EDIT FAMILY MEMBER" : `STEP ${step} OF 2`}
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
              ? "Names can be corrected whenever your family learns more."
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
                  {suggestedLinks.suggestedParentIds.length > 0 && (
                    <fieldset className="suggested-links wide">
                      <legend>Suggested parent links</legend>
                      <p>
                        {selectedRelation?.type === "sibling"
                          ? `${anchorPerson?.firstName || "This person"}'s known parents are preselected because siblings usually share them.`
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
              Birth year <small>Approximate is okay</small>
              <input
                name="birthYear"
                value={form.birthYear}
                onChange={update}
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
                {person ? "Save corrections" : "Place in family map"}{" "}
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
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [inviting, setInviting] = useState(null);
  const [placeholdersFor, setPlaceholdersFor] = useState(null);
  const [linkingPeople, setLinkingPeople] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const loadFamily = async () => {
      await supabase.rpc("accept_family_invitations");
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
            linked_user_id: session.user.id,
            first_name: parts[0] || "Me",
            surname: session.user.user_metadata.family_surname,
            lived_in: profileResult.data.location || null,
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
      const matchResult = await supabase.rpc("find_family_matches");
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
          variant: row.relationship_variant || null,
          startYear: row.start_year,
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
      setLoading(false);
    };
    loadFamily();
    return () => {
      active = false;
    };
  }, [session.user.id, session.user.user_metadata.family_surname]);

  const savePerson = async (form, existing) => {
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
    if (
      form.marriageYear &&
      (!/^\d{4}$/.test(form.marriageYear) ||
        Number(form.marriageYear) < 1800 ||
        Number(form.marriageYear) > new Date().getFullYear())
    )
      throw new Error("Enter a valid four-digit marriage year.");
    const currentYear = new Date().getFullYear();
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
      birth_year: form.birthYear ? Number(form.birthYear) : null,
      birth_location: form.birthLocation,
      lived_locations: livedLocations,
      birth_place:
        form.birthLocation?.display || existing?.legacyBirthPlace || null,
      lived_in: livedLocations[0]?.display || existing?.legacyLivedIn || null,
      family_side: form.side,
    };
    if (existing?.isPlaceholder) {
      payload.is_placeholder = false;
      payload.placeholder_label = null;
      payload.filled_by = session.user.id;
    }
    const memberResult = existing
      ? await supabase
          .from("family_members")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single()
      : await supabase
          .from("family_members")
          .insert({ ...payload, created_by: session.user.id })
          .select()
          .single();
    if (memberResult.error) throw memberResult.error;
    const personIndex = existing
      ? people.findIndex((person) => person.id === existing.id)
      : people.length;
    const savedPerson = personFromRow(
      memberResult.data,
      personIndex,
      session.user.id,
    );
    if (existing) {
      setPeople((current) =>
        current.map((person) =>
          person.id === existing.id ? savedPerson : person,
        ),
      );
    } else {
      const relation = RELATION_OPTIONS.find(
        (option) => option.value === form.relation,
      );
      if (!relation) throw new Error("Choose a relationship.");
      const personAId =
        relation.direction === "from-anchor"
          ? anchorPerson.id
          : memberResult.data.id;
      const personBId =
        relation.direction === "from-anchor"
          ? memberResult.data.id
          : anchorPerson.id;
      let spouseMember = null;
      if (form.spouseMode === "new") {
        const nameParts = form.newSpouseName
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        if (!nameParts.length) {
          await supabase
            .from("family_members")
            .delete()
            .eq("id", memberResult.data.id);
          throw new Error("Enter the spouse's name.");
        }
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
              nameParts.length > 1 ? nameParts.at(-1) : form.surname.trim(),
            family_side: form.side,
            gender: "unspecified",
          })
          .select()
          .single();
        if (spouseResult.error) {
          await supabase
            .from("family_members")
            .delete()
            .eq("id", memberResult.data.id);
          throw spouseResult.error;
        }
        spouseMember = spouseResult.data;
      }
      const relationshipRows = [
        {
          owner_id: anchorPerson.ownerId,
          created_by: session.user.id,
          person_a_id: personAId,
          person_b_id: personBId,
          relationship_type: relation.type,
          relationship_variant: relation.variant || null,
          start_year:
            ["spouse", "partner"].includes(relation.type) && form.marriageYear
              ? Number(form.marriageYear)
              : null,
        },
        ...form.parentIds
          .filter(
            (parentId) =>
              !(personAId === parentId && personBId === memberResult.data.id),
          )
          .map((parentId) => ({
            owner_id: anchorPerson.ownerId,
            created_by: session.user.id,
            person_a_id: parentId,
            person_b_id: memberResult.data.id,
            relationship_type: "parent",
            relationship_variant: null,
            start_year: null,
          })),
      ];
      const spouseId =
        form.spouseMode === "existing" ? form.spouseId : spouseMember?.id;
      if (spouseId) {
        relationshipRows.push({
          owner_id: anchorPerson.ownerId,
          created_by: session.user.id,
          person_a_id: memberResult.data.id,
          person_b_id: spouseId,
          relationship_type: "spouse",
          relationship_variant: null,
          start_year: form.marriageYear ? Number(form.marriageYear) : null,
        });
        if (
          spouseMember &&
          form.spouseIsParent &&
          relation.type === "parent" &&
          relation.direction === "to-anchor"
        ) {
          relationshipRows.push({
            owner_id: anchorPerson.ownerId,
            created_by: session.user.id,
            person_a_id: spouseMember.id,
            person_b_id: anchorPerson.id,
            relationship_type: "parent",
            relationship_variant: null,
            start_year: null,
          });
        }
      }
      const relationshipResult = await supabase
        .from("relationships")
        .insert(relationshipRows)
        .select();
      if (relationshipResult.error) {
        await supabase
          .from("family_members")
          .delete()
          .in("id", [memberResult.data.id, spouseMember?.id].filter(Boolean));
        throw relationshipResult.error;
      }
      const savedSpouse = spouseMember
        ? personFromRow(spouseMember, people.length + 1, session.user.id)
        : null;
      setPeople((current) => [
        ...current,
        savedPerson,
        ...(savedSpouse ? [savedSpouse] : []),
      ]);
      setRelationships((current) => [
        ...current,
        ...relationshipResult.data.map((relationship) => ({
          id: relationship.id,
          from: relationship.person_a_id,
          to: relationship.person_b_id,
          type: relationship.relationship_type,
          variant: relationship.relationship_variant || null,
          startYear: relationship.start_year,
        })),
      ]);
    }
    const matchResult = await supabase.rpc("find_family_matches");
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
  };

  const connect = async (match, status) => {
    const result = await supabase.from("match_decisions").insert({
      owner_id: session.user.id,
      candidate_owner_id: match.ownerId,
      candidate_member_id: match.id,
      status,
    });
    if (result.error) throw result.error;
    setMatches((current) => current.filter((item) => item.id !== match.id));
  };
  const addPlaceholders = async (anchor, totalCount) => {
    const siblingIds = new Set(
      relationships
        .filter(
          (relationship) =>
            relationship.type === "sibling" &&
            (relationship.from === anchor.id || relationship.to === anchor.id),
        )
        .map((relationship) =>
          relationship.from === anchor.id ? relationship.to : relationship.from,
        ),
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
      })),
    ]);
  };
  const linkPeople = async (personA, personB, relation, startYear = "") => {
    if (!personA || !personB || personA.id === personB.id)
      throw new Error("Choose two different people.");
    if (personA.ownerId !== personB.ownerId)
      throw new Error(
        "These records belong to different family graphs and cannot be linked directly yet.",
      );
    if (
      startYear &&
      (!/^\d{4}$/.test(startYear) ||
        Number(startYear) < 1800 ||
        Number(startYear) > new Date().getFullYear())
    )
      throw new Error("Enter a valid four-digit relationship year.");
    const parentRelation = relation.includes("parent");
    const type = parentRelation
      ? "parent"
      : relation === "half-sibling"
        ? "sibling"
        : relation;
    const variant = relation.startsWith("adoptive-")
      ? "adoptive"
      : relation === "half-sibling"
        ? "half"
        : null;
    const from = relation.endsWith("parent-b") ? personB.id : personA.id;
    const to = relation.endsWith("parent-b") ? personA.id : personB.id;
    const symmetric = ["sibling", "spouse", "partner"].includes(type);
    const duplicate = relationships.some(
      (item) =>
        item.type === type &&
        (item.variant || null) === variant &&
        ((item.from === from && item.to === to) ||
          (symmetric && item.from === to && item.to === from)),
    );
    if (duplicate)
      throw new Error("That direct relationship is already recorded.");
    const result = await supabase
      .from("relationships")
      .insert({
        owner_id: personA.ownerId,
        created_by: session.user.id,
        person_a_id: from,
        person_b_id: to,
        relationship_type: type,
        relationship_variant: variant,
        start_year:
          ["spouse", "partner"].includes(type) && startYear
            ? Number(startYear)
            : null,
      })
      .select()
      .single();
    if (result.error) throw result.error;
    setRelationships((current) => [
      ...current,
      {
        id: result.data.id,
        from,
        to,
        type,
        variant: result.data.relationship_variant || null,
        startYear: result.data.start_year,
      },
    ]);
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
      />
      <main>
        <Header
          setMenu={setMenu}
          query={query}
          setQuery={setQuery}
          profile={profile}
          self={people.find((person) => person.isSelf)}
          signOut={() => supabase.auth.signOut()}
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
        ) : page === "places" ? (
          <Places people={people} editPerson={setEditing} />
        ) : (
          <Matches matches={matches} connect={connect} />
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
            new Set(
              relationships
                .filter(
                  (relationship) =>
                    relationship.type === "sibling" &&
                    (relationship.from === placeholdersFor.id ||
                      relationship.to === placeholdersFor.id),
                )
                .map((relationship) =>
                  relationship.from === placeholdersFor.id
                    ? relationship.to
                    : relationship.from,
                ),
            ).size
          }
          close={() => setPlaceholdersFor(null)}
          addPlaceholders={addPlaceholders}
        />
      )}
      {linkingPeople && (
        <LinkPeopleModal
          people={people}
          close={() => setLinkingPeople(false)}
          linkPeople={linkPeople}
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
