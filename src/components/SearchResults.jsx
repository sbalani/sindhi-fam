import { GitFork, MapPin, Search, UsersRound } from "lucide-react";
import { getSearchMatchKind, matchesAnyField, sindhiAwareIncludes } from "../utils/sindhiSearch.js";

const personFields = (person) => [
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

export default function SearchResults({ query, people, branchFor, openPerson, goFamily, goJourney }) {
  const peopleResults = people.filter((person) => matchesAnyField(query, personFields(person)));
  const surnames = [...new Set(people.flatMap((person) => [person.surname, person.maidenName]).filter(Boolean))]
    .filter((name) => sindhiAwareIncludes(name, query));
  const places = [...new Set(people.flatMap((person) => [
    person.birthPlace,
    ...(person.livedLocations || []).map((location) => location.display),
    person.legacyLivedIn,
  ].filter(Boolean)))].filter((place) => sindhiAwareIncludes(place, query));
  const branches = [...new Set(people.map(branchFor))].filter((name) => sindhiAwareIncludes(name, query));
  const any = peopleResults.length || surnames.length || places.length || branches.length;
  return (
    <div className="page search-results global-results">
      <span className="eyebrow">GLOBAL SEARCH</span>
      <h1>Results for “{query}”</h1>
      <p className="search-language-hint">Sindhi and Roman-Sindhi spelling variants are matched automatically for names and places.</p>
      {!any && <div className="empty"><Search /><h3>No results</h3><p>Try a person, surname, city or family branch in English, Roman Sindhi or سنڌي.</p></div>}
      {peopleResults.length > 0 && <section><h2><UsersRound size={18} /> People</h2><div className="search-result-list">{peopleResults.map((person) => {
        const direct = personFields(person).some((field) => getSearchMatchKind(field, query) === "direct");
        return <button key={person.id} onClick={() => openPerson(person)}><strong>{person.name}</strong><span>{person.birthPlace || branchFor(person)}{!direct ? " · spelling variant" : ""}</span></button>;
      })}</div></section>}
      {surnames.length > 0 && <section><h2><GitFork size={18} /> Surnames</h2><div className="search-result-list">{surnames.map((surname) => <button key={surname} onClick={() => goFamily("surnames")}><strong>{surname}</strong><span>{people.filter((person) => [person.surname, person.maidenName].includes(surname)).length} family records</span></button>)}</div></section>}
      {places.length > 0 && <section><h2><MapPin size={18} /> Places</h2><div className="search-result-list">{places.map((place) => <button key={place} onClick={goJourney}><strong>{place}</strong><span>Open family journey</span></button>)}</div></section>}
      {branches.length > 0 && <section><h2><GitFork size={18} /> Branches</h2><div className="search-result-list">{branches.map((branch) => <button key={branch} onClick={() => goFamily("people")}><strong>{branch}</strong><span>Derived relative to you</span></button>)}</div></section>}
    </div>
  );
}
