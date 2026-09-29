import { useEffect, useState } from "react";

const KEY = import.meta.env.VITE_TMDB_KEY;
const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";

// Small wrapper around the TMDB REST API.
async function tmdb(path, params = {}) {
  const qs = new URLSearchParams({ api_key: KEY, ...params });
  const res = await fetch(`${API}${path}?${qs}`);
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`);
  return res.json();
}

// useState that persists to localStorage.
function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }, [key, value]);
  return [value, setValue];
}

const mini = (m) => ({ id: m.id, title: m.title, poster_path: m.poster_path, release_date: m.release_date });
const year = (m) => (m.release_date || "").slice(0, 4);
const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

function MovieCard({ movie, rating, saved, note, onOpen }) {
  return (
    <button className="card" onClick={() => onOpen(movie.id)}>
      <div className="poster">
        {movie.poster_path ? <img src={IMG + movie.poster_path} alt="" loading="lazy" /> : <span>{movie.title}</span>}
        {saved && <span className="flag">Saved</span>}
      </div>
      <div className="info">
        <b>{movie.title}</b>
        <span className="mut">{year(movie) || "—"}</span>
        {rating ? <span className="stars">{stars(rating)}</span> : movie.vote_average ? <span className="mut">TMDB {movie.vote_average.toFixed(1)}</span> : null}
        {note && <span className="why">{note}</span>}
      </div>
    </button>
  );
}

function Details({ id, onClose, rating, saved, onRate, onToggleWatch }) {
  const [movie, setMovie] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState(rating?.review || "");

  useEffect(() => {
    tmdb(`/movie/${id}`, { append_to_response: "credits" }).then(setMovie).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Modal onClose={onClose}><p>{error}</p></Modal>;
  if (!movie) return <Modal onClose={onClose}><p>Loading…</p></Modal>;

  const director = movie.credits?.crew.find((c) => c.job === "Director")?.name;
  const cast = (movie.credits?.cast || []).slice(0, 5).map((c) => c.name).join(", ");

  return (
    <Modal onClose={onClose}>
      <h2>{movie.title} <span className="mut">({year(movie)})</span></h2>
      <p className="mut">
        {[director && `Directed by ${director}`, movie.runtime && `${movie.runtime} min`, movie.genres.map((g) => g.name).join(", ")].filter(Boolean).join(" · ")}
      </p>
      <p>{movie.overview}</p>
      {cast && <p className="mut">Cast: {cast}</p>}
      <div className="rate" role="group" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-label={`${n} stars`} onClick={() => onRate(mini(movie), rating?.stars === n ? 0 : n, text)}>
            {n <= (rating?.stars || 0) ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a short review (optional)" aria-label="Your review" />
      <div className="row">
        <button className="btn" onClick={() => { onRate(mini(movie), rating?.stars || 0, text); onClose(); }}>Save review</button>
        <button className="btn ghost" onClick={() => onToggleWatch(mini(movie))}>{saved ? "Remove from watchlist" : "Add to watchlist"}</button>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("discover");
  const [query, setQuery] = useState("");
  const [genres, setGenres] = useState([]);
  const [genre, setGenre] = useState("");
  const [movies, setMovies] = useState([]);
  const [recs, setRecs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [watch, setWatch] = useStored("cinevault:watch", []);
  const [ratings, setRatings] = useStored("cinevault:ratings", {});

  // Genre list, loaded once.
  useEffect(() => {
    if (KEY) tmdb("/genre/movie/list").then((d) => setGenres(d.genres)).catch(() => {});
  }, []);

  // Discover: search (debounced), genre filter, or trending.
  useEffect(() => {
    if (!KEY || tab !== "discover") return;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const data = query.trim()
          ? await tmdb("/search/movie", { query: query.trim() })
          : genre
          ? await tmdb("/discover/movie", { with_genres: genre, sort_by: "popularity.desc" })
          : await tmdb("/trending/movie/week");
        setMovies(data.results);
      } catch (e) { setError(e.message); }
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, genre, tab]);

  // Recommendations: TMDB "similar" lists for films you rated 4+ or saved, ranked by how often they appear.
  useEffect(() => {
    if (!KEY || tab !== "foryou") return;
    const liked = [
      ...Object.values(ratings).filter((r) => r.stars >= 4).map((r) => r.movie.id),
      ...watch.map((m) => m.id),
    ];
    const seeds = [...new Set(liked)].slice(0, 6);
    if (!seeds.length) { setRecs([]); return; }
    setLoading(true);
    Promise.all(seeds.map((id) => tmdb(`/movie/${id}/recommendations`).then((d) => d.results)))
      .then((lists) => {
        const score = new Map();
        lists.flat().forEach((m) => {
          if (ratings[m.id] || watch.some((w) => w.id === m.id)) return;
          const cur = score.get(m.id) || { movie: m, count: 0 };
          cur.count += 1;
          score.set(m.id, cur);
        });
        setRecs([...score.values()].sort((a, b) => b.count - a.count || b.movie.vote_average - a.movie.vote_average).slice(0, 12));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, ratings, watch]);

  const rate = (movie, stars, review) =>
    setRatings((r) => {
      const next = { ...r };
      if (!stars && !review.trim()) delete next[movie.id];
      else next[movie.id] = { stars, review: review.trim(), movie };
      return next;
    });
  const toggleWatch = (movie) =>
    setWatch((w) => (w.some((m) => m.id === movie.id) ? w.filter((m) => m.id !== movie.id) : [...w, movie]));

  const isSaved = (id) => watch.some((m) => m.id === id);
  const render = (list, note) =>
    list.map((m) => (
      <MovieCard key={m.id} movie={m} rating={ratings[m.id]?.stars} saved={isSaved(m.id)} note={note?.(m)} onOpen={setSelected} />
    ));

  if (!KEY)
    return (
      <div className="wrap">
        <h1>CineVault</h1>
        <p>Add your TMDB API key to run the app. Copy <code>.env.example</code> to <code>.env</code>, set <code>VITE_TMDB_KEY</code>, then restart <code>npm run dev</code>.</p>
      </div>
    );

  return (
    <div className="wrap">
      <h1>CineVault</h1>
      <nav>
        {[["discover", "Discover"], ["foryou", "For you"], ["watchlist", `Watchlist${watch.length ? ` (${watch.length})` : ""}`], ["ratings", "My ratings"]].map(([k, l]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {tab === "discover" && (
        <div className="tools">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search films" aria-label="Search films" />
          <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre" disabled={!!query.trim()}>
            <option value="">All genres</option>
            {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      {error && <p className="error">{error}. Check your API key and internet connection.</p>}
      {loading && <p className="mut">Loading…</p>}

      <main className="grid">
        {tab === "discover" && (movies.length || loading ? render(movies) : <p className="mut">No films found.</p>)}
        {tab === "watchlist" && (watch.length ? render(watch) : <p className="mut">Your watchlist is empty. Open a film and choose Add to watchlist.</p>)}
        {tab === "ratings" && (Object.keys(ratings).length ? render(Object.values(ratings).map((r) => r.movie)) : <p className="mut">Nothing rated yet. Open a film to rate or review it.</p>)}
        {tab === "foryou" && recs && (recs.length ? render(recs.map((r) => r.movie), () => "Similar to films you like") : <p className="mut">Rate a film 4 stars or higher, or save films to your watchlist, and picks appear here.</p>)}
      </main>

      {selected && (
        <Details
          id={selected}
          rating={ratings[selected]}
          saved={isSaved(selected)}
          onRate={rate}
          onToggleWatch={toggleWatch}
          onClose={() => setSelected(null)}
        />
      )}
      <footer>This product uses the TMDB API but is not endorsed or certified by TMDB.</footer>
    </div>
  );
}
