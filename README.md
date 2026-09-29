# CineVault

A movie discovery app built with React and Vite, using the TMDB API.

**Features:** search, genre filter, trending films, film details (director, cast, runtime), 1-5 star ratings, written reviews, watchlist, and recommendations based on films you rate highly or save. Data is stored in your browser's localStorage.

## Run it

1. Get a free API key at https://www.themoviedb.org (Settings > API).
2. `cp .env.example .env` and set `VITE_TMDB_KEY` to your key.
3. `npm install`
4. `npm run dev`

`.env` is git-ignored so your key is never pushed to GitHub.

## How recommendations work

For up to 6 films you rated 4+ stars or saved, the app fetches TMDB's recommendations, counts how often each film appears across those lists, and ranks by that count (ties broken by TMDB rating). Films you've already rated or saved are excluded.
