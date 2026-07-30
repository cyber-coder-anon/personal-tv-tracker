import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, deleteField, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { getShowDetails, getCachedShowDetails, getOmdbRatings, airedCount, withConcurrency } from '../api/tmdb';
import ultimateData from '../ultimate_data.json';
// per-episode rewatch counts recovered from the GDPR rewatched_episode.csv,
// keyed by show name → { "s1e2": { count, date } }
import importedRewatches from '../rewatches.json';
// watched / to-watch / rewatch truth for movies, recovered from
// tracking-prod-records.csv (the migration wrongly merged the watchlist
// into "watched"): { watched: {name: {watch_date, runtime}}, towatch: {name: {release_date}}, rewatches: {name: n} }
import movieMeta from '../movie_meta.json';

const DataContext = createContext(null);

// TV Time-style bucket thresholds
const RECENT_WATCH_MS = 30 * 86400000; // you watched an episode in the last 30 days
const RECENT_AIR_MS = 60 * 86400000;   // the show aired a new episode in the last 60 days

export const epKey = (season, episode) => `s${season}e${episode}`;

export function parseEpKey(key) {
  const m = /^s(\d+)e(\d+)$/.exec(key);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

export function DataProvider({ children }) {
  const [overrides, setOverrides] = useState({});
  // progress: { [showId]: { episodes: {key: isoDate}, removed: {key: true}, rewatches: {key: count} } }
  const [progress, setProgress] = useState({});
  const [added, setAdded] = useState([]);
  // movieWatches: { [movieId]: { count, dates: [] } }
  const [movieWatches, setMovieWatches] = useState({});
  // statusOverrides: { [showId]: { list: 'watching' | 'watch_later' | 'stopped' } }
  const [statusOverrides, setStatusOverrides] = useState({});
  // upcomingHidden: { [showId]: true } — shows the user hid from the Upcoming list
  const [upcomingHidden, setUpcomingHidden] = useState({});
  const [sexScenes, setSexScenes] = useState({});
  const [wokeOverrides, setWokeOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  // ---- Toast + undo ----
  const [toast, setToast] = useState(null); // { message, undo?: fn, ts }
  const toastTimer = useRef(null);
  const notify = useCallback((message, undoFn) => {
    setToast({ message, undo: undoFn, ts: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undoFn ? 7000 : 3500);
  }, []);
  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const performUndo = useCallback(async () => {
    const t = toast;
    dismissToast();
    if (t?.undo) {
      try {
        await t.undo();
        notify('Undone ↩');
      } catch (e) {
        console.error(e);
        notify('Undo failed — check your connection.');
      }
    }
  }, [toast, dismissToast, notify]);

  useEffect(() => {
    const load = async () => {
      const fetchCol = async (name) => {
        try {
          const snap = await getDocs(collection(db, name));
          const out = {};
          snap.forEach(d => { out[d.id] = d.data(); });
          return out;
        } catch (e) {
          console.error(`Failed to load ${name}`, e);
          return {};
        }
      };
      const [ov, pr, ad, mw, st, uh, ss, wo] = await Promise.all([
        fetchCol('posterOverrides'),
        fetchCol('episodeProgress'),
        fetchCol('added'),
        fetchCol('movieWatches'),
        fetchCol('showStatus'),
        fetchCol('upcomingHidden'),
        fetchCol('sexScenes'),
        fetchCol('wokeOverrides'),
      ]);
      setOverrides(Object.fromEntries(Object.entries(ov).map(([k, v]) => [k, v.poster_url])));
      setProgress(pr);
      setAdded(Object.values(ad));
      setMovieWatches(mw);
      setStatusOverrides(st);
      setUpcomingHidden(Object.fromEntries(Object.entries(uh).map(([k, v]) => [k, !!v.hidden])));
      setSexScenes(ss);
      setWokeOverrides(Object.fromEntries(Object.entries(wo).map(([k, v]) => [k, !!v.woke])));
      setLoading(false);
    };
    load();
  }, []);

  // ---- Merged library ----
  // The migration script's categories are status-based and wrong, so we
  // flatten everything and re-bucket with TV Time's rules further down.
  const followedShows = useMemo(() => {
    const base = ultimateData.shows;
    const flat = [...base.watch_next, ...base.havent_watched, ...base.unstarted];
    const knownIds = new Set(
      [...flat, ...base.watch_later].map(s => String(s.tmdb_id || s.id))
    );
    const addedShows = added
      .filter(a => a.media_type === 'tv' && !knownIds.has(String(a.tmdb_id)))
      .map(a => ({ ...a, added_via_app: true }));
    return [...addedShows, ...flat];
  }, [added]);

  const importedWatchLaterIds = useMemo(
    () => new Set(ultimateData.shows.watch_later.map(s => String(s.tmdb_id || s.id))),
    []
  );

  const allShows = useMemo(
    () => [...followedShows, ...ultimateData.shows.watch_later],
    [followedShows]
  );

  // ---- TMDB details (aired counts + air dates), hydrated from cache then fetched ----
  const [tmdbDetails, setTmdbDetails] = useState({});
  const [detailsProgress, setDetailsProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    const withIds = allShows.filter(s => s.tmdb_id);
    const cachedMap = {};
    const missing = [];
    withIds.forEach(s => {
      const c = getCachedShowDetails(s.tmdb_id);
      if (c) cachedMap[String(s.tmdb_id || s.id)] = c;
      else missing.push(s);
    });
    setTmdbDetails(prev => ({ ...cachedMap, ...prev }));
    setDetailsProgress({ done: withIds.length - missing.length, total: withIds.length });
    if (!missing.length) return;

    (async () => {
      let done = withIds.length - missing.length;
      const buffer = {};
      await withConcurrency(missing.map(s => async () => {
        try {
          buffer[String(s.tmdb_id || s.id)] = await getShowDetails(s.tmdb_id);
        } catch { /* show keeps its static-JSON fallback */ }
        done++;
        if (!cancelled && done % 10 === 0) {
          setTmdbDetails(prev => ({ ...prev, ...buffer }));
          setDetailsProgress({ done, total: withIds.length });
        }
      }), 6);
      if (!cancelled) {
        setTmdbDetails(prev => ({ ...prev, ...buffer }));
        setDetailsProgress({ done: withIds.length, total: withIds.length });
      }
    })();
    return () => { cancelled = true; };
  }, [allShows]);

  const getDetails = useCallback(
    (show) => tmdbDetails[String(show.tmdb_id || show.id)] || null,
    [tmdbDetails]
  );

  // ---- IMDb ratings (OMDB) — the default rating source, fetched in the background ----
  const [omdbMap, setOmdbMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    const pending = Object.entries(tmdbDetails)
      .filter(([id, det]) => det?.imdb_id && omdbMap[id] === undefined);
    if (!pending.length) return;
    (async () => {
      const buffer = {};
      let done = 0;
      await withConcurrency(pending.map(([id, det]) => async () => {
        try {
          buffer[id] = await getOmdbRatings(det.imdb_id); // may be null — cache the miss too
        } catch { buffer[id] = null; }
        done++;
        if (!cancelled && done % 15 === 0) setOmdbMap(prev => ({ ...prev, ...buffer }));
      }), 5);
      if (!cancelled) setOmdbMap(prev => ({ ...prev, ...buffer }));
    })();
    return () => { cancelled = true; };
  }, [tmdbDetails]); // eslint-disable-line react-hooks/exhaustive-deps

  const getOmdb = useCallback(
    (show) => omdbMap[String(show.tmdb_id || show.id)] || null,
    [omdbMap]
  );

  // numeric IMDb score ("8.5/10" → 8.5), for cards and sorting
  const getImdbScore = useCallback((show) => {
    const r = getOmdb(show);
    if (!r?.imdb) return null;
    const n = parseFloat(r.imdb);
    return Number.isFinite(n) ? n : null;
  }, [getOmdb]);

  const movies = useMemo(() => {
    const knownIds = new Set(ultimateData.movies.map(m => String(m.tmdb_id || m.name)));
    const addedMovies = added
      .filter(a => a.media_type === 'movie' && !knownIds.has(String(a.tmdb_id)))
      .map(a => ({ ...a, added_via_app: true }));
    const enriched = ultimateData.movies.map(m => {
      const w = movieMeta.watched[m.name];
      const t = movieMeta.towatch[m.name];
      return {
        ...m,
        // in neither CSV list → keep the old date-based assumption
        imported_watched: w ? true : (t ? false : Boolean(m.date)),
        watch_date: w?.watch_date || '',
        release_date: m.release_date || t?.release_date || '',
      };
    });
    return [...addedMovies, ...enriched];
  }, [added]);

  const findShow = useCallback(
    (id) => allShows.find(s => String(s.tmdb_id) === String(id) || String(s.id) === String(id)),
    [allShows]
  );
  const findMovie = useCallback(
    (id) => movies.find(m => String(m.tmdb_id) === String(id) || m.name === id),
    [movies]
  );

  // Merged watched-episode set for a show: JSON base minus removals, plus app-tracked
  const getWatchedSet = useCallback((show) => {
    const id = String(show.tmdb_id || show.id);
    const p = progress[id] || {};
    const removed = p.removed || {};
    const set = new Set();
    (show.episodes_seen || []).forEach(e => {
      const key = epKey(e.season, e.episode);
      if (!removed[key]) set.add(key);
    });
    Object.keys(p.episodes || {}).forEach(key => set.add(key));
    return set;
  }, [progress]);

  // Total times an episode was watched: import watch + imported rewatches
  // + app first-watch + app rewatches
  const getEpisodeWatchCount = useCallback((show, season, episode) => {
    const id = String(show.tmdb_id || show.id);
    const key = epKey(season, episode);
    const p = progress[id] || {};
    const importedRe = importedRewatches[show.name]?.[key]?.count || 0;
    if (p.removed?.[key]) return importedRe + (p.rewatches?.[key] || 0);
    const imported = (show.episodes_seen || [])
      .filter(e => e.season === season && e.episode === episode).length;
    const app = p.episodes?.[key] ? 1 : 0;
    return imported + importedRe + app + (p.rewatches?.[key] || 0);
  }, [progress]);

  const getMovieWatchCount = useCallback((movie) => {
    const id = String(movie.tmdb_id || movie.name);
    const base = movie.added_via_app
      ? Number(movie.watch_count) || 0
      : (movie.imported_watched ? 1 + (movieMeta.rewatches[movie.name] || 0) : 0);
    const extra = movieWatches[id]?.count || 0;
    return Math.max(0, base + extra);
  }, [movieWatches]);

  const watchedMovies = useMemo(
    () => movies.filter(m => getMovieWatchCount(m) > 0),
    [movies, getMovieWatchCount]
  );
  const movieWatchlist = useMemo(
    () => movies.filter(m => getMovieWatchCount(m) === 0),
    [movies, getMovieWatchCount]
  );

  // watched vs AIRED totals (static JSON total counts announced-unaired eps)
  const getShowProgress = useCallback((show) => {
    const det = getDetails(show);
    const watched = getWatchedSet(show).size;
    const total = det ? airedCount(det) : (show.number_of_episodes || 0);
    return { watched, total };
  }, [getDetails, getWatchedSet]);

  const getLastWatch = useCallback((show) => {
    let max = null;
    (show.episodes_seen || []).forEach(e => {
      if (e.date && (!max || e.date > max)) max = e.date;
    });
    const p = progress[String(show.tmdb_id || show.id)];
    Object.values(p?.episodes || {}).forEach(dt => {
      if (!max || dt > max) max = dt;
    });
    return max;
  }, [progress]);

  const getShowStatus = useCallback((show) => {
    const id = String(show.tmdb_id || show.id);
    const ov = statusOverrides[id]?.list;
    if (ov) return ov;
    return importedWatchLaterIds.has(id) ? 'watch_later' : 'watching';
  }, [statusOverrides, importedWatchLaterIds]);

  // ---- TV Time-style categorization ----
  const shows = useMemo(() => {
    const now = Date.now();
    const b = {
      watch_next: [], havent_watched: [], unstarted: [],
      up_to_date: [], finished: [], watch_later: [], stopped: [],
    };
    allShows.forEach(show => {
      const status = getShowStatus(show);
      if (status === 'stopped') { b.stopped.push(show); return; }
      if (status === 'watch_later') { b.watch_later.push(show); return; }

      const det = getDetails(show);
      const { watched, total } = getShowProgress(show);
      if (!watched) { b.unstarted.push(show); return; }
      if (total && watched >= total) {
        const stillGoing = det
          ? Boolean(det.next_episode_to_air) || det.status === 'Returning Series' || det.in_production
          : show.in_production;
        (stillGoing ? b.up_to_date : b.finished).push(show);
        return;
      }
      const lastWatch = getLastWatch(show);
      const lastAir = det?.last_air_date;
      const recentWatch = lastWatch && (now - new Date(lastWatch).getTime()) <= RECENT_WATCH_MS;
      const recentAir = lastAir && (now - new Date(lastAir).getTime()) <= RECENT_AIR_MS;
      (recentWatch || recentAir ? b.watch_next : b.havent_watched).push(show);
    });

    const activity = (s) => {
      const lw = getLastWatch(s);
      const la = getDetails(s)?.last_air_date;
      return Math.max(lw ? new Date(lw).getTime() : 0, la ? new Date(la).getTime() : 0);
    };
    b.watch_next.sort((a, c) => activity(c) - activity(a));
    b.havent_watched.sort((a, c) => activity(c) - activity(a));
    b.up_to_date.sort((a, c) => a.name.localeCompare(c.name));
    b.finished.sort((a, c) => a.name.localeCompare(c.name));
    b.stopped.sort((a, c) => a.name.localeCompare(c.name));
    return b;
  }, [allShows, getShowStatus, getDetails, getShowProgress, getLastWatch]);

  // ---- Raw write ops (no toast) ----
  const _writeMark = useCallback(async (showId, eps, watched) => {
    const id = String(showId);
    const date = new Date().toISOString();
    const episodes = {};
    const removed = {};
    eps.forEach(({ season, episode }) => {
      const key = epKey(season, episode);
      if (watched) { episodes[key] = date; removed[key] = deleteField(); }
      else { episodes[key] = deleteField(); removed[key] = true; }
    });
    setProgress(prev => {
      const p = prev[id] || {};
      const nextEps = { ...(p.episodes || {}) };
      const nextRem = { ...(p.removed || {}) };
      eps.forEach(({ season, episode }) => {
        const key = epKey(season, episode);
        if (watched) { nextEps[key] = date; delete nextRem[key]; }
        else { delete nextEps[key]; nextRem[key] = true; }
      });
      return { ...prev, [id]: { ...p, episodes: nextEps, removed: nextRem } };
    });
    await setDoc(doc(db, 'episodeProgress', id), { episodes, removed }, { merge: true });
  }, []);

  const _writeRewatch = useCallback(async (showId, eps, delta) => {
    const id = String(showId);
    const firebasePayload = {};
    setProgress(prev => {
      const p = prev[id] || {};
      const rw = { ...(p.rewatches || {}) };
      eps.forEach(({ season, episode }) => {
        const key = epKey(season, episode);
        rw[key] = Math.max(0, (rw[key] || 0) + delta);
      });
      return { ...prev, [id]: { ...p, rewatches: rw } };
    });
    eps.forEach(({ season, episode }) => {
      firebasePayload[epKey(season, episode)] = increment(delta);
    });
    await setDoc(doc(db, 'episodeProgress', id), { rewatches: firebasePayload }, { merge: true });
  }, []);

  const _writeMovieWatch = useCallback(async (movieId, date, delta) => {
    const id = String(movieId);
    setMovieWatches(prev => {
      const cur = prev[id] || { count: 0, dates: [] };
      return {
        ...prev,
        [id]: {
          count: cur.count + delta,
          dates: delta > 0 ? [...cur.dates, date] : cur.dates.filter(d => d !== date),
        },
      };
    });
    await setDoc(doc(db, 'movieWatches', id), {
      count: increment(delta),
      dates: delta > 0 ? arrayUnion(date) : arrayRemove(date),
    }, { merge: true });
  }, []);

  // ---- Public actions (optimistic + toast with undo) ----
  const markEpisode = useCallback(async (showId, season, episode, label) => {
    await _writeMark(showId, [{ season, episode }], true);
    notify(label || `✓ S${season} E${episode} marked watched`,
      () => _writeMark(showId, [{ season, episode }], false));
  }, [_writeMark, notify]);

  const unmarkEpisode = useCallback(async (showId, season, episode) => {
    await _writeMark(showId, [{ season, episode }], false);
    notify(`S${season} E${episode} marked unwatched`,
      () => _writeMark(showId, [{ season, episode }], true));
  }, [_writeMark, notify]);

  const markEpisodesBulk = useCallback(async (showId, eps, label) => {
    if (!eps.length) return;
    await _writeMark(showId, eps, true);
    notify(label || `✓ ${eps.length} episodes marked watched`,
      () => _writeMark(showId, eps, false));
  }, [_writeMark, notify]);

  const rewatchEpisode = useCallback(async (showId, season, episode, label) => {
    const eps = [{ season, episode }];
    await _writeRewatch(showId, eps, 1);
    notify(label || `↻ Rewatch logged for S${season} E${episode}`,
      () => _writeRewatch(showId, eps, -1));
  }, [_writeRewatch, notify]);

  const rewatchEpisodesBulk = useCallback(async (showId, eps, label) => {
    if (!eps.length) return;
    await _writeRewatch(showId, eps, 1);
    notify(label || `↻ Rewatch logged for ${eps.length} episodes`,
      () => _writeRewatch(showId, eps, -1));
  }, [_writeRewatch, notify]);

  const markMovieWatched = useCallback(async (movieId, label) => {
    const date = new Date().toISOString();
    await _writeMovieWatch(movieId, date, 1);
    notify(label || '✓ Movie marked watched', () => _writeMovieWatch(movieId, date, -1));
  }, [_writeMovieWatch, notify]);

  const setShowStatus = useCallback(async (showId, list, label) => {
    const id = String(showId);
    const prevEntry = statusOverrides[id];
    setStatusOverrides(prev => ({ ...prev, [id]: { list } }));
    await setDoc(doc(db, 'showStatus', id), { list });
    notify(label || 'Show moved', async () => {
      if (prevEntry) {
        setStatusOverrides(prev => ({ ...prev, [id]: prevEntry }));
        await setDoc(doc(db, 'showStatus', id), prevEntry);
      } else {
        setStatusOverrides(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        await deleteDoc(doc(db, 'showStatus', id));
      }
    });
  }, [statusOverrides, notify]);

  const setPosterOverride = useCallback(async (itemId, url) => {
    const id = String(itemId);
    setOverrides(prev => ({ ...prev, [id]: url }));
    await setDoc(doc(db, 'posterOverrides', id), { poster_url: url });
  }, []);

  const setUpcomingHiddenFor = useCallback(async (showId, hidden, label) => {
    const id = String(showId);
    setUpcomingHidden(prev => ({ ...prev, [id]: hidden }));
    await setDoc(doc(db, 'upcomingHidden', id), { hidden });
    notify(label || (hidden ? 'Hidden from Upcoming' : 'Restored to Upcoming'), async () => {
      setUpcomingHidden(prev => ({ ...prev, [id]: !hidden }));
      await setDoc(doc(db, 'upcomingHidden', id), { hidden: !hidden });
    });
  }, [notify]);

  const setWokeOverride = useCallback(async (itemId, woke) => {
    const id = String(itemId);
    setWokeOverrides(prev => ({ ...prev, [id]: woke }));
    await setDoc(doc(db, 'wokeOverrides', id), { woke });
  }, []);

  const addItem = useCallback(async (item) => {
    setAdded(prev => [...prev.filter(a => !(a.media_type === item.media_type && String(a.tmdb_id) === String(item.tmdb_id))), item]);
    await setDoc(doc(db, 'added', `${item.media_type}_${item.tmdb_id}`), item);
    notify(`✓ ${item.name} added to your library`);
  }, [notify]);

  const addSexScene = useCallback(async (mediaId, season, episode, timestamp = '') => {
    const id = String(mediaId);
    const key = season ? `s${season}e${episode}` : 'movie';
    const newScene = { timestamp, addedAt: Date.now() };
    
    setSexScenes(prev => {
      const p = prev[id] || { scenes: {} };
      const scenes = { ...p.scenes };
      scenes[key] = [...(scenes[key] || []), newScene];
      return { ...prev, [id]: { scenes } };
    });
    
    await setDoc(doc(db, 'sexScenes', id), {
      [`scenes.${key}`]: arrayUnion(newScene)
    }, { merge: true });
    
    notify('Sex scene tracked');
  }, [notify]);

  const removeSexScene = useCallback(async (mediaId, season, episode, sceneObj) => {
    const id = String(mediaId);
    const key = season ? `s${season}e${episode}` : 'movie';
    
    setSexScenes(prev => {
      const p = prev[id] || { scenes: {} };
      const scenes = { ...p.scenes };
      scenes[key] = (scenes[key] || []).filter(s => s.addedAt !== sceneObj.addedAt);
      return { ...prev, [id]: { scenes } };
    });
    
    // In firestore, arrayRemove needs exact object match
    await setDoc(doc(db, 'sexScenes', id), {
      [`scenes.${key}`]: arrayRemove(sceneObj)
    }, { merge: true });
  }, []);

  const getSexScenes = useCallback((mediaId, season, episode) => {
    const id = String(mediaId);
    const key = season ? `s${season}e${episode}` : 'movie';
    return (sexScenes[id]?.scenes?.[key]) || [];
  }, [sexScenes]);

  const getShowSexSceneStats = useCallback((mediaId) => {
    const id = String(mediaId);
    const scenes = sexScenes[id]?.scenes || {};
    let total = 0;
    const bySeason = {};
    Object.keys(scenes).forEach(k => {
      const match = parseEpKey(k);
      if (match) {
        const c = scenes[k].length;
        total += c;
        bySeason[match.season] = (bySeason[match.season] || 0) + c;
      }
    });
    return { total, bySeason };
  }, [sexScenes]);

  const value = {
    loading,
    dashboard: ultimateData.dashboard,
    shows,
    allShows,
    movies,
    watchedMovies,
    movieWatchlist,
    overrides,
    progress,
    detailsProgress,
    toast,
    notify,
    dismissToast,
    performUndo,
    getWatchedSet,
    getEpisodeWatchCount,
    getMovieWatchCount,
    getShowProgress,
    getLastWatch,
    getDetails,
    getOmdb,
    getImdbScore,
    getShowStatus,
    upcomingHidden,
    setUpcomingHiddenFor,
    findShow,
    findMovie,
    markEpisode,
    unmarkEpisode,
    markEpisodesBulk,
    rewatchEpisode,
    rewatchEpisodesBulk,
    setPosterOverride,
    addItem,
    markMovieWatched,
    setShowStatus,
    addSexScene,
    removeSexScene,
    getSexScenes,
    getShowSexSceneStats,
    wokeOverrides,
    setWokeOverride,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
