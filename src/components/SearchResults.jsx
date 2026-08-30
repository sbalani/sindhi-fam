import { GitFork, MapPin, Search, UsersRound } from "lucide-react";

export default function SearchResults({ query, people, relationships, branchFor, openPerson, goFamily, goJourney }) {
  const q = query.trim().toLowerCase();
  const peopleResults = people.filter((person) => `${person.name} ${person.maidenName} ${person.birthPlace} ${person.livedIn}`.toLowerCase().includes(q));
  const surnames = [...new Set(people.flatMap((person) => [person.surname, person.maidenName]).filter(Boolean))].filter((name) => name.toLowerCase().includes(q));
  const places = [...new Set(people.flatMap((person) => [person.birthPlace, ...(person.livedLocations || []).map((location) => location.display), person.legacyLivedIn].filter(Boolean)))].filter((place) => place.toLowerCase().includes(q));
  const branches = [...new Set(people.map(branchFor))].filter((name) => name.toLowerCase().includes(q));
  const any = peopleResults.length || surnames.length || places.length || branches.length;
  return (
    <div className="page search-results global-results">
      <span className="eyebrow">GLOBAL SEARCH</span>
      <h1>Results for “{query}”</h1>
      {!any && <div className="empty"><Search /><h3>No results</h3><p>Try a person, surname, city or family branch.</p></div>}
      {peopleResults.length > 0 && <section><h2><UsersRound size={18} /> People</h2><div className="search-result-list">{peopleResults.map((person) => <button key={person.id} onClick={() => openPerson(person)}><strong>{person.name}</strong><span>{person.birthPlace || branchFor(person)}</span></button>)}</div></section>}
      {surnames.length > 0 && <section><h2><GitFork size={18} /> Surnames</h2><div className="search-result-list">{surnames.map((surname) => <button key={surname} onClick={() => goFamily("surnames")}><strong>{surname}</strong><span>{people.filter((person) => [person.surname, person.maidenName].includes(surname)).length} family records</span></button>)}</div></section>}
      {places.length > 0 && <section><h2><MapPin size={18} /> Places</h2><div className="search-result-list">{places.map((place) => <button key={place} onClick={goJourney}><strong>{place}</strong><span>Open family journey</span></button>)}</div></section>}
      {branches.length > 0 && <section><h2><GitFork size={18} /> Branches</h2><div className="search-result-list">{branches.map((branch) => <button key={branch} onClick={() => goFamily("people")}><strong>{branch}</strong><span>Derived relative to you</span></button>)}</div></section>}
    </div>
  );
}
