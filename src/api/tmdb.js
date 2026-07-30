const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function cacheGet(key, customTTL = CACHE_TTL) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    if (Date.now() - t > customTTL) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    // storage full — evict our own cache entries and retry once
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('tmdb:'))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
    } catch { /* give up silently */ }
  }
}

export function posterUrl(path, size = 'w300') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

// Synchronous cache read — lets the app categorize instantly on revisits
// (v2 suffix busts pre-ratings cache entries)
export function getCachedShowDetails(tmdbId) {
  return cacheGet(`tmdb:tv3:${tmdbId}`);
}

// pick a content rating / certification: US first, then India, then anything
function pickCert(entries, extract) {
  if (!entries || !entries.length) return null;
  for (const cc of ['US', 'IN', 'GB']) {
    const hit = entries.find(e => e.iso_3166_1 === cc);
    const val = hit && extract(hit);
    if (val) return val;
  }
  for (const e of entries) {
    const val = extract(e);
    if (val) return val;
  }
  return null;
}

// TMDB's number_of_episodes includes announced-but-unaired episodes.
// Derive the truly aired count from the next-episode-to-air pointer.
export function airedCount(details) {
  if (!details) return null;
  const next = details.next_episode_to_air;
  if (!next) return details.number_of_episodes;
  let sum = 0;
  (details.seasons || []).forEach(s => {
    if (s.season_number < next.season_number) sum += s.episode_count;
  });
  return sum + (next.episode_number - 1);
}

// Scrape IMDb Parental Guide to auto-detect episodes with nudity mentions
export async function scrapeImdbNudity(imdbId) {
  if (!imdbId) return [];
  try {
    const url = encodeURIComponent(`https://www.imdb.com/title/${imdbId}/parentalguide`);
    const proxyUrl = `https://api.allorigins.win/get?url=${url}`;
    const res = await fetch(proxyUrl);
    const data = await res.json();
    const html = data.contents;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    // Look for "Sex & Nudity" section. Usually it's under an id like advisory-nudity
    const nuditySection = doc.getElementById('advisory-nudity');
    if (!nuditySection) return [];
    
    const text = nuditySection.textContent || "";
    const eps = new Set();
    
    // Match "S1 E2", "Season 1 Episode 2", etc.
    const regex1 = /[S|s]eason\s*(\d+)[\s,]*[E|e]pisode\s*(\d+)/g;
    let match;
    while ((match = regex1.exec(text)) !== null) {
      eps.add(`${Number(match[1])}-${Number(match[2])}`);
    }
    
    const regex2 = /[S|s]0?(\d+)[E|e]0?(\d+)/g;
    while ((match = regex2.exec(text)) !== null) {
      eps.add(`${Number(match[1])}-${Number(match[2])}`);
    }
    
    return Array.from(eps).map(e => {
      const [s, ep] = e.split('-');
      return { season: Number(s), episode: Number(ep) };
    });
  } catch (e) {
    console.error("Failed to scrape IMDb nudity", e);
    return [];
  }
}

// Slim show details: seasons structure + next episode + ratings + cert (cached)
export async function getShowDetails(tmdbId) {
  const key = `tmdb:tv4:${tmdbId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const res = await fetch(`${BASE}/tv/${tmdbId}?api_key=${API_KEY}&append_to_response=content_ratings,external_ids,keywords`);
  if (!res.ok) throw new Error(`TMDB tv/${tmdbId} failed: ${res.status}`);
  const full = await res.json();
  const slim = {
    id: full.id,
    name: full.name,
    status: full.status,
    in_production: full.in_production,
    number_of_episodes: full.number_of_episodes,
    vote_average: full.vote_average,
    vote_count: full.vote_count,
    networks: (full.networks || []).map(n => n.name),
    content_rating: pickCert(full.content_ratings?.results, e => e.rating),
    imdb_id: full.external_ids?.imdb_id || null,
    seasons: (full.seasons || [])
      .filter(s => s.season_number > 0)
      .map(s => ({
        season_number: s.season_number,
        episode_count: s.episode_count,
        name: s.name,
        vote_average: s.vote_average,
      })),
    next_episode_to_air: full.next_episode_to_air
      ? {
          season_number: full.next_episode_to_air.season_number,
          episode_number: full.next_episode_to_air.episode_number,
          air_date: full.next_episode_to_air.air_date,
          name: full.next_episode_to_air.name,
        }
      : null,
    last_air_date: full.last_air_date,
    first_air_date: full.first_air_date,
    keywords: full.keywords?.results?.map(k => k.name.toLowerCase()) || [],
  };
  cacheSet(key, slim);
  return slim;
}

// Slim season episode list with thumbnails, overviews and ratings (cached)
export async function getSeasonEpisodes(tmdbId, seasonNumber) {
  const key = `tmdb:season2:${tmdbId}:${seasonNumber}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const res = await fetch(`${BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${API_KEY}`);
  if (!res.ok) throw new Error(`TMDB season fetch failed: ${res.status}`);
  const full = await res.json();
  const slim = (full.episodes || []).map(e => ({
    episode_number: e.episode_number,
    name: e.name,
    air_date: e.air_date,
    runtime: e.runtime,
    still_path: e.still_path,
    overview: e.overview,
    vote_average: e.vote_average,
    vote_count: e.vote_count,
  }));
  cacheSet(key, slim);
  return slim;
}

// Slim movie details: ratings, certification, companies (cached)
export async function getMovieDetails(tmdbId) {
  const key = `tmdb:movie3:${tmdbId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const res = await fetch(`${BASE}/movie/${tmdbId}?api_key=${API_KEY}&append_to_response=release_dates,external_ids,keywords`);
  if (!res.ok) throw new Error(`TMDB movie/${tmdbId} failed: ${res.status}`);
  const full = await res.json();
  const slim = {
    id: full.id,
    title: full.title,
    vote_average: full.vote_average,
    vote_count: full.vote_count,
    runtime: full.runtime,
    release_date: full.release_date,
    genres: (full.genres || []).map(g => g.name),
    companies: (full.production_companies || []).slice(0, 3).map(c => c.name),
    certification: pickCert(
      full.release_dates?.results,
      e => (e.release_dates || []).map(r => r.certification).find(Boolean)
    ),
    imdb_id: full.external_ids?.imdb_id || full.imdb_id || null,
    overview: full.overview,
    keywords: full.keywords?.keywords?.map(k => k.name.toLowerCase()) || [],
  };
  cacheSet(key, slim);
  return slim;
}

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

// IMDb / Rotten Tomatoes / Metacritic ratings via OMDB (cached 24h)
let cachedOmdbConfig = null;

async function fetchOmdbConfig() {
  if (cachedOmdbConfig) return cachedOmdbConfig;
  try {
    const snap = await getDoc(doc(db, "config", "omdb"));
    if (snap.exists()) {
      cachedOmdbConfig = snap.data();
    } else {
      // Initialize Firebase with the keys if the document doesn't exist yet
      cachedOmdbConfig = {
        'c2c04f0': 0, '7b34370f': 0, '3a4bf056': 0, 
        '4956c853': 0, '270aed5a': 0, '6a5ee170': 0
      };
      await setDoc(doc(db, "config", "omdb"), cachedOmdbConfig);
    }
  } catch (e) {
    console.warn("Failed to fetch OMDB config from Firebase, falling back to defaults", e);
    const keys = (import.meta.env.VITE_OMDB_API_KEYS || "").split(',');
    const initialConfig = {};
    keys.forEach(k => initialConfig[k.trim()] = 0);
    cachedOmdbConfig = initialConfig;
  }
  return cachedOmdbConfig;
}

let cachedOmdbData = null;

async function fetchOmdbCache() {
  if (cachedOmdbData) return cachedOmdbData;
  try {
    const snap = await getDoc(doc(db, "config", "omdb_cache"));
    if (snap.exists()) {
      cachedOmdbData = snap.data();
    } else {
      cachedOmdbData = {};
      await setDoc(doc(db, "config", "omdb_cache"), cachedOmdbData);
    }
  } catch (e) {
    console.warn("Failed to fetch OMDB cache from Firebase", e);
    cachedOmdbData = {};
  }
  return cachedOmdbData;
}

export async function getOmdbRatings(imdbId, forceRefresh = false) {
  if (!imdbId) return null;
  
  const dataCache = await fetchOmdbCache();
  
  if (!forceRefresh && dataCache[imdbId]) {
    // 365 days TTL mapped to the timestamp we'll store
    if (Date.now() < dataCache[imdbId].expiresAt) {
      return dataCache[imdbId].ratings;
    }
  }

  const config = await fetchOmdbConfig();
  const availableKeys = Object.keys(config).filter(k => Date.now() >= (config[k] || 0));
  if (availableKeys.length === 0) return null; // All keys are on cooldown in Firebase

  for (const activeKey of availableKeys) {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${activeKey}`);
    if (!res.ok) throw new Error(`OMDB failed: ${res.status}`);
    const data = await res.json();
    
    // If the current key hit its daily limit, put it on a 24h cooldown in Firebase
    if (data.Response === 'False' && data.Error === 'Request limit reached!') {
      config[activeKey] = Date.now() + 24 * 60 * 60 * 1000;
      try {
        await setDoc(doc(db, "config", "omdb"), config, { merge: true });
      } catch (e) { console.error("Failed to sync OMDB cooldown to Firebase", e); }
      continue; 
    }

    if (data.Response !== 'True') return null;
    
    const ratings = {};
    (data.Ratings || []).forEach(r => {
      if (r.Source === 'Internet Movie Database') ratings.imdb = r.Value;
      if (r.Source === 'Rotten Tomatoes') ratings.rt = r.Value;
      if (r.Source === 'Metacritic') ratings.metacritic = r.Value;
    });
    if (!ratings.imdb && data.imdbRating && data.imdbRating !== 'N/A') ratings.imdb = `${data.imdbRating}/10`;
    ratings.imdbVotes = data.imdbVotes !== 'N/A' ? data.imdbVotes : null;
    ratings.rated = data.Rated !== 'N/A' ? data.Rated : null;
    
    // Cache it in Firebase for 365 days
    dataCache[imdbId] = {
      ratings,
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
    };
    try {
      await setDoc(doc(db, "config", "omdb_cache"), {
        [imdbId]: dataCache[imdbId]
      }, { merge: true });
    } catch (e) { console.error("Failed to save OMDB data to Firebase", e); }
    
    return ratings;
  }
  
  return null; // All available keys failed
}

export async function getOmdbSeasonRatings(imdbId, seasonNumber, forceRefresh = false) {
  if (!imdbId) return null;
  const dataCache = await fetchOmdbCache();
  
  if (!forceRefresh && dataCache[imdbId]?.seasons?.[seasonNumber]) {
    if (Date.now() < dataCache[imdbId].expiresAt) {
      return dataCache[imdbId].seasons[seasonNumber];
    }
  }

  const config = await fetchOmdbConfig();
  const availableKeys = Object.keys(config).filter(k => Date.now() >= (config[k] || 0));
  if (availableKeys.length === 0) return null;

  for (const activeKey of availableKeys) {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&Season=${seasonNumber}&apikey=${activeKey}`);
    if (!res.ok) continue;
    const data = await res.json();
    
    if (data.Response === 'False' && data.Error === 'Request limit reached!') {
      config[activeKey] = Date.now() + 24 * 60 * 60 * 1000;
      try {
        await setDoc(doc(db, "config", "omdb"), config, { merge: true });
      } catch (e) {}
      continue;
    }
    if (data.Response !== 'True') return null;

    const epRatings = {};
    (data.Episodes || []).forEach(ep => {
      epRatings[ep.Episode] = ep.imdbRating !== 'N/A' ? parseFloat(ep.imdbRating) : null;
    });

    if (!dataCache[imdbId]) dataCache[imdbId] = { ratings: {}, expiresAt: Date.now() + 365*24*60*60*1000, seasons: {} };
    if (!dataCache[imdbId].seasons) dataCache[imdbId].seasons = {};
    dataCache[imdbId].seasons[seasonNumber] = epRatings;
    
    try {
      await setDoc(doc(db, "config", "omdb_cache"), {
        [imdbId]: dataCache[imdbId]
      }, { merge: true });
    } catch (e) { console.error("Failed to save OMDB season data to Firebase", e); }

    return epRatings;
  }
  return null;
}

export async function getImages(tmdbId, type) {
  const endpoint = type === 'show' ? 'tv' : 'movie';
  const res = await fetch(`${BASE}/${endpoint}/${tmdbId}/images?api_key=${API_KEY}`);
  if (!res.ok) throw new Error(`TMDB images fetch failed: ${res.status}`);
  return res.json();
}

export async function searchMulti(query) {
  const res = await fetch(`${BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`);
  if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter(r => r.media_type === 'tv' || r.media_type === 'movie');
}

// Popular movies releasing in the next 2 years (cached)
export async function getUpcomingMovies() {
  const key = 'tmdb:upcoming-movies-v2';
  const cached = cacheGet(key);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 730 * 86400000).toISOString().slice(0, 10);
  const all = [];
  for (const page of [1, 2, 3, 4, 5]) {
    const res = await fetch(
      `${BASE}/discover/movie?api_key=${API_KEY}&primary_release_date.gte=${today}&primary_release_date.lte=${end}` +
      `&sort_by=popularity.desc&include_adult=false&page=${page}`
    );
    if (!res.ok) continue;
    const data = await res.json();
    all.push(...(data.results || []));
  }
  
  const slim = [];
  const validMovies = all.filter(m => m.release_date);
  await withConcurrency(validMovies.map(m => async () => {
    try {
      const det = await getMovieDetails(m.id);
      slim.push({
        tmdb_id: m.id,
        name: m.title,
        release_date: m.release_date,
        poster_path: m.poster_path,
        overview: m.overview,
        status: det.status
      });
    } catch {
      slim.push({
        tmdb_id: m.id,
        name: m.title,
        release_date: m.release_date,
        poster_path: m.poster_path,
        overview: m.overview,
        status: 'Unknown'
      });
    }
  }), 15);

  slim.sort((a, b) => a.release_date.localeCompare(b.release_date));
  cacheSet(key, slim);
  return slim;
}

// Full details used when adding a new item to the library
export async function getFullDetails(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const res = await fetch(`${BASE}/${endpoint}/${tmdbId}?api_key=${API_KEY}`);
  if (!res.ok) throw new Error(`TMDB details fetch failed: ${res.status}`);
  return res.json();
}

// Run promise-returning thunks with limited concurrency
export async function withConcurrency(thunks, limit = 6) {
  const results = new Array(thunks.length);
  let i = 0;
  async function worker() {
    while (i < thunks.length) {
      const idx = i++;
      try {
        results[idx] = await thunks[idx]();
      } catch {
        results[idx] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return results;
}
