import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, Check, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { getUpcomingMovies, posterUrl } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

const PAGE_SIZE = 60;

function Movies() {
  const [activeTab, setActiveTab] = useState('watched');
  const [filter, setFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { watchedMovies, movieWatchlist, overrides, getMovieWatchCount, markMovieWatched, getSexScenes, getImdbScore } = useData();

  const source = activeTab === 'watched' ? watchedMovies : movieWatchlist;
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return source;
    return source.filter(m => m.name.toLowerCase().includes(q));
  }, [source, filter]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className={`tab-btn ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => { setActiveTab('watched'); setVisibleCount(PAGE_SIZE); }}>
          Watched ({watchedMovies.length})
        </button>
        <button className={`tab-btn ${activeTab === 'watchlist' ? 'active' : ''}`} onClick={() => { setActiveTab('watchlist'); setVisibleCount(PAGE_SIZE); }}>
          Watchlist ({movieWatchlist.length})
        </button>
        <button className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>
          Upcoming
        </button>
      </div>

      {activeTab !== 'upcoming' && (
        <>
          <input
            type="text"
            className="search-input"
            style={{ maxWidth: 320, marginBottom: '1.5rem', display: 'block' }}
            placeholder={`Filter ${activeTab === 'watched' ? 'watched movies' : 'watchlist'}…`}
            value={filter}
            onChange={e => { setFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}
          />

          {activeTab === 'watchlist' && filtered.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>
              Your movie watchlist is empty — add movies from the Search page or the Upcoming tab.
            </p>
          )}

          <div className="shows-grid">
            {visible.map((movie, index) => {
              const id = String(movie.tmdb_id || movie.name);
              const count = getMovieWatchCount(movie);
              return (
                <MediaCard
                  key={`${id}-${index}`}
                  item={movie}
                  type="movie"
                  overrides={overrides}
                  meta={count > 0 ? `Watched ${count}x` : 'Not watched'}
                  rating={getImdbScore(movie) ?? movie.vote_average}
                  ratingSource={getImdbScore(movie) ? 'IMDb' : 'TMDB'}
                  sexCount={getSexScenes(movie.tmdb_id || movie.name)?.length || 0}
                  quickCheck={activeTab === 'watchlist' ? {
                    label: 'Mark watched',
                    onClick: () => markMovieWatched(id, `✓ ${movie.name} marked watched`),
                  } : undefined}
                />
              );
            })}
          </div>

          {visibleCount < filtered.length && (
            <button
              className="secondary-btn"
              style={{ width: '100%', marginTop: '15px' }}
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            >
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}

      {activeTab === 'upcoming' && <UpcomingMovies />}
    </div>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(dateStr) {
  const [y, m] = dateStr.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function UpcomingMovies() {
  const navigate = useNavigate();
  const { movieWatchlist, movies, addItem, getMovieWatchCount } = useData();
  const [upcoming, setUpcoming] = useState(null);
  const [error, setError] = useState(false);
  const [addingIds, setAddingIds] = useState({});

  useEffect(() => {
    let cancelled = false;
    getUpcomingMovies()
      .then(list => { if (!cancelled) setUpcoming(list); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const yourUpcoming = useMemo(
    () => movieWatchlist
      .filter(m => m.release_date && m.release_date >= today)
      .sort((a, b) => a.release_date.localeCompare(b.release_date)),
    [movieWatchlist, today]
  );

  const libraryIds = useMemo(
    () => new Set(movies.filter(m => m.tmdb_id).map(m => String(m.tmdb_id))),
    [movies]
  );

  const handleAdd = async (m) => {
    const id = String(m.tmdb_id);
    setAddingIds(prev => ({ ...prev, [id]: true }));
    try {
      await addItem({
        media_type: 'movie',
        tmdb_id: m.tmdb_id,
        name: m.name,
        watch_count: 0,
        runtime: '',
        date: '',
        release_date: m.release_date,
        poster_path: m.poster_path,
        overview: m.overview,
      });
    } finally {
      setAddingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const renderRow = (m, { added, adding, releasedInfo }) => {
    const id = String(m.tmdb_id || m.name);
    const poster = m.full_poster_url || posterUrl(m.poster_path, 'w92');
    const days = Math.ceil((new Date(m.release_date) - new Date()) / 86400000);
    return (
      <div
        key={id}
        className="upcoming-row"
        onClick={() => added && navigate(`/details/movie/${id}`)}
        style={{ cursor: added ? 'pointer' : 'default' }}
      >
        <div className="upcoming-poster" style={{ background: poster ? `url(${poster}) center/cover` : '#111' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
            {m.name}
            {m.status === 'Rumored' && <span className="accent-pill" style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', background: 'var(--color-accent-dim)', color: 'var(--color-accent)' }}>Rumored</span>}
            {m.release_date?.endsWith('-12-31') && <span className="muted-pill" style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px' }}>Rumored Date</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {releasedInfo || (days <= 0 ? 'Out now!' : days === 1 ? 'Tomorrow' : `in ${days} days`)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--color-cyan)', fontWeight: 600, fontSize: 14 }}>{m.release_date}</span>
          {added ? (
            <span className="muted-pill"><Check size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />Listed</span>
          ) : (
            <button
              className="primary-btn"
              style={{ fontSize: 13, padding: '6px 12px' }}
              disabled={adding}
              onClick={(e) => { e.stopPropagation(); handleAdd(m); }}
            >
              {adding
                ? <Loader2 size={13} className="spin" style={{ verticalAlign: '-2px', marginRight: 4 }} />
                : <Plus size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />}
              Add
            </button>
          )}
        </div>
      </div>
    );
  };

  if (error) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>Couldn't reach TMDB for upcoming releases.</p>;
  if (!upcoming) return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}><Loader2 size={14} className="spin" style={{ verticalAlign: '-2px', marginRight: 6 }} />Loading release calendar…</p>;

  // group the TMDB calendar by month
  const byMonth = [];
  upcoming.forEach(m => {
    const label = monthLabel(m.release_date);
    const bucket = byMonth.find(b => b.label === label);
    if (bucket) bucket.items.push(m);
    else byMonth.push({ label, items: [m] });
  });

  return (
    <div>
      {yourUpcoming.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>
            <CalendarDays size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />
            From your watchlist ({yourUpcoming.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {yourUpcoming.map(m => renderRow(m, { added: true }))}
          </div>
        </div>
      )}

      <h3 style={{ marginBottom: '1rem' }}>In theaters soon</h3>
      {byMonth.map(({ label, items }) => (
        <div key={label} style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--color-text-muted)', marginBottom: 10, fontFamily: 'var(--font-body)', fontWeight: 600 }}>{label}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(m => renderRow(m, {
              added: libraryIds.has(String(m.tmdb_id)),
              adding: !!addingIds[String(m.tmdb_id)],
            }))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Movies;
