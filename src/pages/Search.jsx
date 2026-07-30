import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, Loader2, Globe } from 'lucide-react';
import { useData } from '../context/DataContext';
import { searchMulti, getFullDetails, posterUrl } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

function Search() {
  const [query, setQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [addingIds, setAddingIds] = useState({});
  const navigate = useNavigate();
  const { allShows, movies, overrides, getShowProgress, getMovieWatchCount, addItem } = useData();

  const q = query.trim().toLowerCase();

  const localShows = useMemo(
    () => q.length < 2 ? [] : allShows.filter(s => s.name.toLowerCase().includes(q)).slice(0, 12),
    [q, allShows]
  );
  const localMovies = useMemo(
    () => q.length < 2 ? [] : movies.filter(m => m.name.toLowerCase().includes(q)).slice(0, 12),
    [q, movies]
  );

  const libraryIds = useMemo(() => {
    const set = new Set();
    allShows.forEach(s => s.tmdb_id && set.add(`tv_${s.tmdb_id}`));
    movies.forEach(m => m.tmdb_id && set.add(`movie_${m.tmdb_id}`));
    return set;
  }, [allShows, movies]);

  const searchTmdb = async () => {
    if (q.length < 2) return;
    setSearching(true);
    setTmdbResults(null);
    try {
      const results = await searchMulti(query.trim());
      setTmdbResults(results.slice(0, 18));
    } catch (e) {
      console.error(e);
      setTmdbResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (result) => {
    const key = `${result.media_type}_${result.id}`;
    setAddingIds(prev => ({ ...prev, [key]: 'busy' }));
    try {
      const full = await getFullDetails(result.id, result.media_type);
      const item = result.media_type === 'tv'
        ? {
            media_type: 'tv',
            id: String(full.id),
            tmdb_id: full.id,
            name: full.name,
            episodes_seen: [],
            status: 'following',
            poster_path: full.poster_path,
            overview: full.overview,
            genres: (full.genres || []).map(g => g.name),
            networks: (full.networks || []).map(n => n.name),
            in_production: full.in_production,
            number_of_episodes: full.number_of_episodes,
          }
        : {
            media_type: 'movie',
            tmdb_id: full.id,
            name: full.title,
            watch_count: 0,
            runtime: full.runtime ? String(full.runtime * 60) : '',
            date: '',
            release_date: full.release_date || '',
            poster_path: full.poster_path,
            overview: full.overview,
            genres: (full.genres || []).map(g => g.name),
          };
      await addItem(item);
      setAddingIds(prev => ({ ...prev, [key]: 'done' }));
    } catch (e) {
      console.error(e);
      setAddingIds(prev => ({ ...prev, [key]: undefined }));
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Search Shows & Movies</h2>
      <div style={{ display: 'flex', gap: 10, marginBottom: '2rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="search-input"
          placeholder="Search your library or TMDB…"
          value={query}
          autoFocus
          onChange={e => { setQuery(e.target.value); setTmdbResults(null); }}
          onKeyDown={e => { if (e.key === 'Enter') searchTmdb(); }}
        />
        <button className="primary-btn" onClick={searchTmdb} disabled={searching || q.length < 2}>
          {searching
            ? <Loader2 size={16} className="spin" style={{ verticalAlign: '-3px', marginRight: 6 }} />
            : <Globe size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />}
          Find new on TMDB
        </button>
      </div>

      {q.length < 2 && (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>
          Type at least 2 characters to search your {allShows.length} shows and {movies.length} movies —
          or hit "Find new on TMDB" to add something you're not tracking yet.
        </p>
      )}

      {q.length >= 2 && (localShows.length > 0 || localMovies.length > 0) && (
        <div>
          {localShows.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                Your Shows ({localShows.length})
              </h3>
              <div className="shows-grid">
                {localShows.map(show => {
                  const { watched, total } = getShowProgress(show);
                  return (
                    <MediaCard
                      key={String(show.tmdb_id || show.id)}
                      item={show}
                      type="show"
                      overrides={overrides}
                      meta={`${watched} / ${total || '?'} watched`}
                    />
                  );
                })}
              </div>
            </div>
          )}
          {localMovies.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                Your Movies ({localMovies.length})
              </h3>
              <div className="shows-grid">
                {localMovies.map(movie => (
                  <MediaCard
                    key={String(movie.tmdb_id || movie.name)}
                    item={movie}
                    type="movie"
                    overrides={overrides}
                    meta={`Watched ${getMovieWatchCount(movie)} time(s)`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {q.length >= 2 && localShows.length === 0 && localMovies.length === 0 && !tmdbResults && !searching && (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem' }}>
          Nothing in your library matches "{query}". Try "Find new on TMDB".
        </p>
      )}

      {tmdbResults && (
        <div>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            TMDB Results ({tmdbResults.length})
          </h3>
          {tmdbResults.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No results on TMDB either.</p>}
          <div className="shows-grid">
            {tmdbResults.map(r => {
              const key = `${r.media_type}_${r.id}`;
              const inLibrary = libraryIds.has(key) || addingIds[key] === 'done';
              const busy = addingIds[key] === 'busy';
              const name = r.media_type === 'tv' ? r.name : r.title;
              const year = (r.first_air_date || r.release_date || '').slice(0, 4);
              const bg = posterUrl(r.poster_path);
              return (
                <div
                  key={key}
                  className="show-card"
                  style={{ cursor: inLibrary ? 'pointer' : 'default' }}
                  onClick={() => inLibrary && navigate(`/details/${r.media_type === 'tv' ? 'show' : 'movie'}/${r.id}`)}
                >
                  <div className="show-poster" style={{ background: bg ? `url(${bg}) center/cover` : '#111' }}>
                    {!bg && <div className="show-title-overlay">{name}</div>}
                  </div>
                  <div className="show-info">
                    <h4 className="show-name">{name}</h4>
                    <p className="show-meta">{r.media_type === 'tv' ? 'TV Show' : 'Movie'}{year ? ` · ${year}` : ''}</p>
                    {inLibrary ? (
                      <button className="secondary-btn" style={{ fontSize: 13, padding: '6px 12px' }} disabled>
                        <Check size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} /> In library
                      </button>
                    ) : (
                      <button
                        className="primary-btn"
                        style={{ fontSize: 13, padding: '6px 12px' }}
                        disabled={busy}
                        onClick={(e) => { e.stopPropagation(); handleAdd(r); }}
                      >
                        {busy
                          ? <Loader2 size={14} className="spin" style={{ verticalAlign: '-2px', marginRight: 4 }} />
                          : <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />}
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default Search;
