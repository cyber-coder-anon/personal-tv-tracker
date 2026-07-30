import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronDown, ChevronRight, Loader2, EyeOff, Eye } from 'lucide-react';
import { useData, epKey } from '../context/DataContext';
import { getShowDetails, getSeasonEpisodes, withConcurrency, posterUrl } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

// First unwatched AIRED episode — never offers episodes that haven't aired yet
async function computeNextEpisode(show, watchedSet) {
  const details = await getShowDetails(show.tmdb_id);
  const next = details.next_episode_to_air;
  for (const s of details.seasons) {
    let maxEp = s.episode_count;
    if (next) {
      if (s.season_number > next.season_number) maxEp = 0;
      else if (s.season_number === next.season_number) maxEp = next.episode_number - 1;
    }
    for (let e = 1; e <= maxEp; e++) {
      if (!watchedSet.has(epKey(s.season_number, e))) {
        return { season: s.season_number, episode: e };
      }
    }
  }
  return null; // fully caught up
}

function Shows() {
  const [activeTab, setActiveTab] = useState('watchlist');
  const [expanded, setExpanded] = useState({});
  const [busyIds, setBusyIds] = useState({});
  const { shows, overrides, getWatchedSet, getShowProgress, getDetails, getImdbScore, markEpisode, notify, detailsProgress, getShowSexSceneStats } = useData();

  const quickCheckNext = async (show) => {
    const id = String(show.tmdb_id || show.id);
    if (!show.tmdb_id) { notify(`${show.name}: no TMDB id, open details to track manually.`); return; }
    setBusyIds(prev => ({ ...prev, [id]: true }));
    try {
      const watched = getWatchedSet(show);
      const next = await computeNextEpisode(show, watched);
      if (!next) {
        notify(`${show.name}: you're all caught up! 🎉`);
      } else {
        await markEpisode(id, next.season, next.episode,
          `✓ ${show.name} — S${next.season} E${next.episode} marked watched`);
      }
    } catch (e) {
      console.error(e);
      notify(`Couldn't update ${show.name}. Check your connection.`);
    } finally {
      setBusyIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const renderCards = (showList, withQuickCheck) => (
    <div className="shows-grid">
      {showList.map(show => {
        const id = String(show.tmdb_id || show.id);
        const { watched, total } = getShowProgress(show);
        return (
          <MediaCard
            key={id}
            item={show}
            type="show"
            overrides={overrides}
            meta={`${watched} / ${total || '?'} watched`}
            rating={getImdbScore(show) ?? getDetails(show)?.vote_average}
            ratingSource={getImdbScore(show) ? 'IMDb' : 'TMDB'}
            sexCount={getShowSexSceneStats(show.tmdb_id || show.id)?.total || 0}
            progressPct={total ? (watched / total) * 100 : undefined}
            quickCheck={withQuickCheck ? {
              label: 'Mark next episode watched',
              busy: !!busyIds[id],
              onClick: () => quickCheckNext(show),
            } : undefined}
          />
        );
      })}
    </div>
  );

  const renderSection = (title, showList, withQuickCheck = false) => (
    showList.length === 0 ? null : (
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
          {title} ({showList.length})
        </h3>
        {renderCards(showList, withQuickCheck)}
      </div>
    )
  );

  const renderCollapsible = (key, title, showList, withQuickCheck = false) => (
    showList.length === 0 ? null : (
      <div style={{ marginBottom: '1rem' }}>
        <button
          className="secondary-btn"
          onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
        >
          {expanded[key] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {title} ({showList.length})
        </button>
        {expanded[key] && <div style={{ marginTop: '1rem' }}>{renderCards(showList, withQuickCheck)}</div>}
      </div>
    )
  );

  const stillScanning = detailsProgress.total > 0 && detailsProgress.done < detailsProgress.total;

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem', alignItems: 'center' }}>
        <button className={`tab-btn ${activeTab === 'watchlist' ? 'active' : ''}`} onClick={() => setActiveTab('watchlist')}>Watchlist</button>
        <button className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>Upcoming</button>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', minHeight: '20px' }}>
        {stillScanning && (
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={13} className="spin" />
            Updating air dates {detailsProgress.done}/{detailsProgress.total}
          </span>
        )}
      </div>

      {activeTab === 'watchlist' && (
        <div>
          {renderSection('Watch Next', shows.watch_next, true)}
          {renderSection('Haven\'t watched for a while', shows.havent_watched, true)}
          {renderSection('Haven\'t started', shows.unstarted, true)}
          {renderCollapsible('up_to_date', 'Up to date — waiting for new episodes', shows.up_to_date)}
          {renderCollapsible('finished', 'Finished', shows.finished)}
          {renderCollapsible('watch_later', 'Watch Later', shows.watch_later, true)}
          {renderCollapsible('stopped', 'Stopped watching', shows.stopped)}
        </div>
      )}

      {activeTab === 'upcoming' && <UpcomingTab />}
    </div>
  );
}

function relativeDays(dateStr) {
  const days = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (days <= 0) return 'Today!';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} week${days < 14 ? '' : 's'}`;
  return `in ${Math.round(days / 30)} month${days < 60 ? '' : 's'}`;
}

function dateHeading(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function UpcomingTab() {
  const { shows, overrides, upcomingHidden, setUpcomingHiddenFor } = useData();
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState(null);
  const [scanned, setScanned] = useState(0);
  const [showHidden, setShowHidden] = useState(false);

  const candidates = useMemo(
    () => [...shows.watch_next, ...shows.havent_watched, ...shows.unstarted, ...shows.up_to_date, ...shows.watch_later]
      .filter(s => s.tmdb_id),
    [shows]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let done = 0;
      const results = await withConcurrency(candidates.map(show => async () => {
        try {
          const details = await getShowDetails(show.tmdb_id);
          const next = details.next_episode_to_air;
          let episodes = [];
          if (next) {
            try {
              const seasonData = await getSeasonEpisodes(show.tmdb_id, next.season_number);
              const today = new Date().toISOString().slice(0, 10);
              episodes = seasonData.filter(ep => ep.air_date && ep.air_date >= today);
            } catch (e) {
              console.warn('Failed to fetch season for upcoming tab', e);
            }
            if (episodes.length === 0) episodes = [next]; 
          }
          return { show, episodes };
        } finally {
          done++;
          if (!cancelled) setScanned(done);
        }
      }), 6);
      if (cancelled) return;

      const allUpcoming = [];
      results.forEach(r => {
        if (!r || !r.episodes || r.episodes.length === 0) return;
        
        const grouped = {};
        r.episodes.forEach(ep => {
          if (!grouped[ep.air_date]) grouped[ep.air_date] = [];
          grouped[ep.air_date].push(ep);
        });

        Object.keys(grouped).forEach(date => {
           allUpcoming.push({
             show: r.show,
             episodes: grouped[date],
             air_date: date,
             key: `${r.show.tmdb_id}-${date}`
           });
        });
      });
      
      allUpcoming.sort((a, b) => a.air_date.localeCompare(b.air_date));
      setUpcoming(allUpcoming);
    };
    run();
    return () => { cancelled = true; };
  }, [candidates]);

  const renderRow = ({ show, episodes, air_date, key }, isHidden) => {
    const id = String(show.tmdb_id || show.id);
    const poster = (overrides && overrides[id]) || show.full_poster_url || posterUrl(show.poster_path, 'w92');
    
    const firstEp = episodes[0];
    const lastEp = episodes[episodes.length - 1];
    const isStack = episodes.length > 1;

    return (
      <div
        key={key}
        className="upcoming-row"
        style={isHidden ? { opacity: 0.6 } : undefined}
        onClick={() => navigate(`/details/show/${id}`)}
      >
        <div className="upcoming-poster" style={{ background: poster ? `url(${poster}) center/cover` : '#111' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.name}</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {isStack ? (
              <span>S{firstEp.season_number} E{firstEp.episode_number}-E{lastEp.episode_number} <strong style={{color:'var(--color-cyan)'}}>({episodes.length} episode stack)</strong></span>
            ) : (
              <span>S{firstEp.season_number} E{firstEp.episode_number}{firstEp.name ? ` · ${firstEp.name}` : ''}</span>
            )}
          </div>
        </div>
        {isHidden && (
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>{air_date}</span>
        )}
        <button
          className="hide-btn"
          title={isHidden ? 'Show in Upcoming again' : 'Hide from Upcoming'}
          onClick={(e) => {
            e.stopPropagation();
            setUpcomingHiddenFor(id, !isHidden,
              isHidden ? `👁 ${show.name} restored to Upcoming` : `🙈 ${show.name} hidden from Upcoming`);
          }}
        >
          {isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
    );
  };

  if (!upcoming) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
        <h3>Checking air dates…</h3>
        <p>{scanned} / {candidates.length} shows scanned</p>
      </div>
    );
  }

  const visible = upcoming.filter(r => !upcomingHidden[String(r.show.tmdb_id || r.show.id)]);
  const hidden = upcoming.filter(r => upcomingHidden[String(r.show.tmdb_id || r.show.id)]);

  // group visible episodes by air date
  const dateGroups = [];
  visible.forEach(r => {
    const g = dateGroups.find(x => x.date === r.air_date);
    if (g) g.items.push(r);
    else dateGroups.push({ date: r.air_date, items: [r] });
  });

  return (
    <div>
      <h3 style={{ marginBottom: '1.25rem' }}>
        <CalendarDays size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />
        Upcoming Episodes ({visible.length})
      </h3>

      {visible.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>
          No upcoming episodes{hidden.length ? ' (some are hidden below)' : ''}.
        </p>
      )}

      {dateGroups.map(({ date, items }) => (
        <div key={date} style={{ marginBottom: '1.25rem' }}>
          <div className="date-heading">
            <span>{dateHeading(date)}</span>
            <span className="date-heading-chip">{relativeDays(date)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(r => renderRow(r, false))}
          </div>
        </div>
      ))}

      {hidden.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <button
            className="secondary-btn"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
            onClick={() => setShowHidden(v => !v)}
          >
            {showHidden ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Hidden shows ({hidden.length})
          </button>
          {showHidden && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: '1rem' }}>
              {hidden.map(r => renderRow(r, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Shows;
