import { useEffect, useState } from "react";

const routeFor = (page, personId) => {
  if (page === "home") return "/";
  if (page === "person" && personId) return `/person/${personId}`;
  return `/${page}`;
};

const readRoute = () => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.startsWith("/person/")) return { page: "person", personId: path.split("/")[2] || null };
  const page = path === "/" ? "home" : path.slice(1);
  return {
    page: ["home", "family", "tree", "matches", "journey", "settings"].includes(page) ? page : "home",
    personId: null,
  };
};

export default function useUrlPage() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = (page, personId = null, { replace = false } = {}) => {
    const next = { page, personId };
    const path = routeFor(page, personId);
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setRoute(next);
  };

  return [route, navigate];
}
