import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Plus, Loader2, RotateCcw, Clock, Ban, Play, Star, X, Globe, Activity, ListVideo, MoreVertical } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, CartesianGrid, ReferenceArea, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useData, epKey } from '../context/DataContext';
import { getShowDetails, getSeasonEpisodes, getMovieDetails, getOmdbRatings, getImages, posterUrl, withConcurrency, getOmdbSeasonRatings, scrapeImdbNudity } from '../api/tmdb';
import { analyzeMediaWithGemini } from '../api/gemini';

function Details() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const {
    findShow, findMovie, overrides, getWatchedSet, getMovieWatchCount,
    getShowProgress, getShowStatus, setShowStatus, setPosterOverride, markMovieWatched,
    getDetails, getShowSexSceneStats, getSexScenes, addSexScene, removeSexScene,
    wokeOverrides,
    setWokeOverride
  } = useData();

  const item = type === 'show' ? findShow(id) : findMovie(id);

  const [altPosters, setAltPosters] = useState([]);
  const [isEditingPoster, setIsEditingPoster] = useState(false);
  const [posterSaved, setPosterSaved] = useState(false);
  const [apiDetails, setApiDetails] = useState(null);
  const [geminiAnalysis, setGeminiAnalysis] = useState(null);
  const [omdb, setOmdb] = useState(null);
  const [showGraphMobile, setShowGraphMobile] = useState(false);
  const [showOverviewMobile, setShowOverviewMobile] = useState(false);
  const [showMenuMobile, setShowMenuMobile] = useState(false);
  const [imdbSeasons, setImdbSeasons] = useState(null);

  const showDetails = type === 'show' && item ? getDetails(item) : null;

  // api details + OMDB ratings (IMDb / RT / Metacritic)
  useEffect(() => {
    let cancelled = false;
    setOmdb(null);
    setApiDetails(null);
    setGeminiAnalysis(null);
    if (!item?.tmdb_id) return;
    (async () => {
      try {
        let imdbId = null;
        if (type === 'movie') {
          const det = await getMovieDetails(item.tmdb_id);
          if (cancelled) return;
          setApiDetails(det);
          imdbId = det.imdb_id;
        } else {
          const det = await getShowDetails(item.tmdb_id);
          if (cancelled) return;
          setApiDetails(det);
          imdbId = det.imdb_id;
        }

        // Run Gemini Analysis
        const year = type === 'show' ? (item.first_air_date || '').substring(0,4) : (item.release_date || '').substring(0,4);
        analyzeMediaWithGemini(item.name || item.title, year, type).then(analysis => {
          if (!cancelled && analysis) {
            setGeminiAnalysis(analysis);
          }
        });

        if (imdbId) {
          const r = await getOmdbRatings(imdbId);
          if (!cancelled) setOmdb(r);
        }
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [item?.tmdb_id, type]);

  const handleRefreshOmdb = async () => {
    try {
      const imdbId = apiDetails?.imdb_id;
      if (imdbId) {
        setOmdb(null);
        const r = await getOmdbRatings(imdbId, true);
        setOmdb(r);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const currentPoster = useMemo(() => {
    if (!item) return '';
    return (overrides && overrides[String(id)])
      || item.full_poster_url
      || posterUrl(item.poster_path, 'w500')
      || '';
  }, [item, overrides, id]);

  const fetchAltPosters = async () => {
    if (!item || !item.tmdb_id) return;
    setIsEditingPoster(true);
    try {
      const data = await getImages(item.tmdb_id, type);
      setAltPosters((data.posters || []).slice(0, 20));
    } catch (e) {
      console.error(e);
    }
  };

  const selectPoster = async (path) => {
    const fullUrl = posterUrl(path, 'w500');
    setIsEditingPoster(false);
    try {
      await setPosterOverride(String(id), fullUrl);
      setPosterSaved(true);
      setTimeout(() => setPosterSaved(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  if (!item) return <div style={{ padding: '2rem' }}>Item not found.</div>;

  const watchedSet = type === 'show' ? getWatchedSet(item) : null;

  const ageRating = type === 'show' 
    ? (showDetails?.content_rating || omdb?.rated) 
    : (apiDetails?.certification || omdb?.rated);
  const tmdbRating = type === 'show' ? showDetails?.vote_average : apiDetails?.vote_average;
  const tmdbVotes = type === 'show' ? showDetails?.vote_count : apiDetails?.vote_count;
  const networks = type === 'show' ? (showDetails?.networks || []) : [];
  const companies = type === 'movie' ? (apiDetails?.companies || []) : [];

  const hasSeasons = type === 'show' && item.tmdb_id;

  return (
    <div>
      <button className="secondary-btn" onClick={() => navigate(-1)} style={{ marginBottom: '20px' }}>
        &larr; Back
      </button>

      <div className={`details-layout ${hasSeasons ? '' : 'no-seasons'}`}>
        <div className="details-main">
          
          <div className="details-header">
            <div className="details-poster-col">
              <div style={{ position: 'relative' }}>
                {currentPoster
                  ? <img src={currentPoster} alt={item.name} style={{ width: '100%', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'block' }} />
                  : <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No poster</div>
                }
                
                {/* Mobile-only overlay progress bar */}
                <div className="mobile-only-poster-bar">
                  {type === 'show' && getShowProgress(item).total > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(0,0,0,0.6)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                       <div style={{ width: `${Math.min(100, Math.round((getShowProgress(item).watched / getShowProgress(item).total) * 100))}%`, height: '100%', background: 'var(--color-cyan)' }} />
                    </div>
                  )}
                  {type === 'movie' && getMovieWatchCount(item) > 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(0,0,0,0.6)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                       <div style={{ width: '100%', height: '100%', background: 'var(--color-cyan)' }} />
                    </div>
                  )}
                </div>
              </div>
              <button className="secondary-btn" style={{ width: '100%', marginTop: '10px' }} onClick={fetchAltPosters}>
            Edit Poster
          </button>
          {posterSaved && <p style={{ color: 'var(--color-cyan)', fontSize: 13, marginTop: 6, textAlign: 'center' }}>Poster saved ✓</p>}
        </div>

        <div className="details-info-col">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 className="details-title" style={{ fontSize: '2rem', marginBottom: '10px' }}>
              {item.name}
              {type === 'show' && apiDetails?.first_air_date && (
                <span style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)', marginLeft: 8, fontWeight: 400 }}>
                  ({apiDetails.first_air_date.substring(0, 4)})
                </span>
              )}
            </h2>
            {type === 'show' && (
              <div className="mobile-list-controls">
                <button className="icon-btn" onClick={() => setShowMenuMobile(!showMenuMobile)}>
                  <MoreVertical size={24} />
                </button>
                {showMenuMobile && (
                  <div className="mobile-context-menu">
                    {getShowStatus(item) !== 'watching' && (
                      <button className="secondary-btn" onClick={() => { setShowStatus(String(item.tmdb_id || item.id), 'watching', `▶ ${item.name} moved to Watching`); setShowMenuMobile(false); }}>
                        <Play size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Resume
                      </button>
                    )}
                    {getShowStatus(item) !== 'watch_later' && (
                      <button className="secondary-btn" onClick={() => { setShowStatus(String(item.tmdb_id || item.id), 'watch_later', `🕓 ${item.name} moved to Watch Later`); setShowMenuMobile(false); }}>
                        <Clock size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Watch later
                      </button>
                    )}
                    {getShowStatus(item) !== 'stopped' && (
                      <button className="secondary-btn" onClick={() => { setShowStatus(String(item.tmdb_id || item.id), 'stopped', `✋ Stopped watching ${item.name}`); setShowMenuMobile(false); }}>
                        <Ban size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Stop watching
                      </button>
                    )}
                    <button className="secondary-btn" onClick={() => {
                        const isWoke = wokeOverrides[String(item.tmdb_id || item.id)];
                        setWokeOverride(item.tmdb_id || item.id, !isWoke);
                        setShowMenuMobile(false);
                      }}>
                        <span className="icon">⚠️</span> {wokeOverrides[String(item.tmdb_id || item.id)] ? 'Unmark Woke' : 'Mark as Woke'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
            {ageRating && <span className="age-badge" title="Age rating">{ageRating}</span>}
            
            {/* Modern/Woke Themes Badge */}
            {(wokeOverrides[String(item.tmdb_id || item.id)] || geminiAnalysis?.woke || apiDetails?.keywords?.some(k => ['lgbt', 'lgbtq', 'feminism', 'feminist', 'social justice', 'diversity', 'political correctness', 'woke', 'wokeness', 'politics', 'strong female lead', 'strong female character', 'female protagonist', 'race swapping', 'inclusive'].includes(k))) && (
               <span className="accent-pill" style={{ fontSize: '12px', background: 'var(--color-coral)', color: '#fff', fontWeight: 'bold' }}>⚠️ WOKE</span>
            )}
            
            {/* Gemini Sex Scenes Badge (if detected) */}
            {geminiAnalysis?.sex_scenes && (
               <span className="accent-pill" style={{ fontSize: '12px', background: 'var(--color-primary)', color: '#fff', fontWeight: 'bold' }}>🔞 Sex Scenes</span>
            )}

            {/* Reboot/Sequel Badge */}
            {apiDetails?.keywords?.some(k => ['reboot', 'remake', 'sequel', 'spin-off', 'spin off', 'revival'].includes(k)) && (
               <span className="accent-pill" style={{ fontSize: '12px', background: '#fbbf24', color: '#000', fontWeight: 'bold' }}>Reboot/Sequel</span>
            )}

            {item.genres?.map(g => (
              <span key={g} className="accent-pill" style={{ fontSize: '12px' }}>{g}</span>
            ))}
          </div>

          {(networks.length > 0 || companies.length > 0) && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 14 }}>
              {type === 'show' ? 'Network' : 'Studio'}:{' '}
              <strong style={{ color: 'var(--color-ink)' }}>
                {(type === 'show' ? networks : companies).join(' · ')}
              </strong>
              {type === 'movie' && apiDetails?.release_date && (
                <> — released {apiDetails.release_date}</>
              )}
            </p>
          )}

          {/* Ratings */}
          <RatingsRow tmdb={tmdbRating} votes={tmdbVotes} omdb={omdb} onRefresh={handleRefreshOmdb} />

          {item.overview && (
            <div className="surface-panel details-overview" style={{ marginBottom: '20px' }}>
              <div 
                className="mobile-overview-header"
                onClick={() => setShowOverviewMobile(!showOverviewMobile)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Overview</h3>
                <span className="mobile-overview-toggle" style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                  {showOverviewMobile ? '▲' : '▼'}
                </span>
              </div>
              <p className={`mobile-overview-content ${showOverviewMobile ? 'show' : ''}`} style={{ color: 'var(--color-text-muted)', marginTop: '10px' }}>
                {item.overview}
              </p>
            </div>
          )}

          <div className="desktop-only-stats">
            <div className="surface-panel">
              <h3 style={{ marginBottom: '10px', fontSize: '1.2rem' }}>Stats</h3>
              {type === 'show' ? (
                <ShowStats progress={getShowProgress(item)} stats={getShowSexSceneStats(item.tmdb_id || item.id)} />
              ) : (
                <MovieStats
                  item={item}
                  runtime={apiDetails?.runtime}
                  watchCount={getMovieWatchCount(item)}
                  onMarkWatched={() => markMovieWatched(String(item.tmdb_id || item.name), `✓ ${item.name} marked watched`)}
                  sexScenes={getSexScenes(item.tmdb_id || item.name)}
                  addSexScene={addSexScene}
                  removeSexScene={removeSexScene}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* (The bulky mobile-only-stats panel has been completely removed) */}

      <div className="details-controls desktop-list-controls" style={{ marginBottom: '20px' }}>
        {type === 'show' && (
          <ShowListControls
            status={getShowStatus(item)}
            onMove={(list, label) => setShowStatus(String(item.tmdb_id || item.id), list, label)}
            name={item.name}
            wokeOverrides={wokeOverrides}
            setWokeOverride={setWokeOverride}
            item={item}
          />
        )}
      </div>

          {hasSeasons && (
            <div className="graph-container">
              <button 
                className="secondary-btn mobile-only-graph-toggle" 
                onClick={() => setShowGraphMobile(!showGraphMobile)}
                style={{ width: '100%', marginBottom: '16px' }}
              >
                {showGraphMobile ? 'Hide Ratings Graph' : 'Show Ratings Graph 📈'}
              </button>
              <div className={`graph-content ${showGraphMobile ? 'show' : ''}`}>
                <RatingsGraph item={item} onSeasonDataLoaded={setImdbSeasons} />
              </div>
            </div>
          )}
        </div>

        {hasSeasons && (
          <div className="details-seasons">
            <SeasonTracker item={item} watchedSet={watchedSet} imdbSeasons={imdbSeasons} />
          </div>
        )}
      </div>

      {isEditingPoster && (
        <div className="poster-modal">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2>Select a Poster</h2>
            <button className="primary-btn" onClick={() => setIsEditingPoster(false)}>Cancel</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
            {altPosters.map(p => (
              <img
                key={p.file_path}
                src={posterUrl(p.file_path)}
                style={{ width: '100%', cursor: 'pointer', border: '2px solid transparent', borderRadius: '4px' }}
                onClick={() => selectPoster(p.file_path)}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-cyan)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'transparent'}
              />
            ))}
            {altPosters.length === 0 && <p>No alternative posters found on TMDB.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingsRow({ tmdb, votes, omdb, onRefresh }) {
  const hasAny = tmdb || omdb?.imdb || omdb?.rt || omdb?.metacritic;
  if (!hasAny) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
      {omdb?.imdb && (
        <span className="rating-badge imdb" title={omdb.imdbVotes ? `${omdb.imdbVotes} votes on IMDb` : 'IMDb'}>
          <Star size={12} fill="currentColor" style={{ verticalAlign: '-1px', marginRight: 4 }} />
          {omdb.imdb} <small>IMDb</small>
        </span>
      )}
      {tmdb ? (
        <span className="rating-badge" title={votes ? `${votes.toLocaleString()} votes on TMDB` : 'TMDB'}>
          {tmdb.toFixed(1)} <small>TMDB</small>
        </span>
      ) : null}
      {omdb?.rt && (
        <span className="rating-badge rt" title="Rotten Tomatoes">
          🍅 {omdb.rt}
        </span>
      )}
      {omdb?.metacritic && (
        <span className="rating-badge mc" title="Metacritic">
          {omdb.metacritic} <small>MC</small>
        </span>
      )}
      <button className="icon-btn" onClick={onRefresh} title="Force refresh OMDb ratings">
        <RotateCcw size={14} />
      </button>
    </div>
  );
}

const SEASON_COLORS = ['#00e5cc', '#fbbf24'];

function GraphTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: '#04070d', border: '1px solid rgba(136,146,176,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ fontWeight: 600 }}>{d.label}{d.name ? ` · ${d.name}` : ''}</div>
      <div style={{ color: 'var(--color-cyan)' }}>★ {d.rating.toFixed(1)}</div>
    </div>
  );
}

function interpolateColor(color1, color2, factor) {
  return color1.map((c, i) => Math.round(c + factor * (color2[i] - c)));
}
function rgbToHex(rgb) {
  return "#" + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
}

const getDotColor = (val) => {
  if (val >= 9.7) return '#ffd700'; // Gold
  if (val >= 8.0) {
    const factor = Math.min(1, Math.max(0, (val - 8.0) / (9.6 - 8.0)));
    return rgbToHex(interpolateColor([50, 205, 50], [0, 100, 0], factor));
  }
  if (val >= 4.0) {
    const factor = Math.min(1, Math.max(0, (val - 4.0) / (8.0 - 4.0)));
    return rgbToHex(interpolateColor([255, 0, 0], [255, 215, 0], factor));
  }
  return '#9c27b0';
};

const COLOR_BINS = [
  { label: '9.7+', color: '#ffd700' },
  { label: '8.0 - 9.6', color: 'linear-gradient(to right, #32cd32, #006400)' },
  { label: '4.0 - 7.9', color: 'linear-gradient(to right, #ff0000, #ffd700)' },
  { label: '< 4.0', color: '#9c27b0' }
];

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  const isGold = payload.rating >= 9.7;
  return (
    <g>
      {isGold && (
        <circle cx={cx} cy={cy} r={14} fill="url(#godRays)" style={{ mixBlendMode: 'screen' }}>
          <animate attributeName="r" values="12;16;12" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r={isGold ? 4 : 3} fill={getDotColor(payload.rating)} stroke="none" filter={isGold ? "url(#goldGlow)" : "none"} />
    </g>
  );
};

const CustomActiveDot = (props) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  const isGold = payload.rating >= 9.7;
  return (
    <g>
      {isGold && (
        <circle cx={cx} cy={cy} r={18} fill="url(#godRays)" style={{ mixBlendMode: 'screen' }}>
          <animate attributeName="r" values="16;20;16" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r={isGold ? 6 : 5} fill={getDotColor(payload.rating)} stroke="#fff" strokeWidth={1.5} filter={isGold ? "url(#goldGlow)" : "none"} />
    </g>
  );
};

function RatingsGraph({ item, onSeasonDataLoaded }) {
  const [seasons, setSeasons] = useState(null);
  const [details, setDetails] = useState(null);
  const [epData, setEpData] = useState(null);
  const [showTrendline, setShowTrendline] = useState(true);
  const [mode, setMode] = useState('episodes');

  useEffect(() => {
    let cancelled = false;
    getShowDetails(item.tmdb_id)
      .then(d => { 
        if (!cancelled) {
          setSeasons(d.seasons); 
          setDetails(d);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.tmdb_id]);

  useEffect(() => {
    if (!seasons || !details || epData) return;
    let cancelled = false;
    (async () => {
      const imdbId = details.imdb_id;
      const lists = await withConcurrency(
        seasons.map(s => () => getSeasonEpisodes(item.tmdb_id, s.season_number)), 6
      );
      const imdbLists = imdbId ? await withConcurrency(
        seasons.map(s => () => getOmdbSeasonRatings(imdbId, s.season_number)), 6
      ) : [];
      
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      const flat = [];
      let globalIdx = 1;

      seasons.forEach((s, i) => {
        (lists[i] || []).forEach(ep => {
          const imdbScore = imdbLists[i] ? imdbLists[i][ep.episode_number] : null;
          const rating = imdbScore || ep.vote_average;
          if (rating > 0 && (!ep.air_date || ep.air_date <= today)) {
            flat.push({
              index: globalIdx++,
              label: `S${s.season_number} E${ep.episode_number}`,
              name: ep.name,
              rating: rating,
              ratingSource: imdbScore ? 'IMDb' : 'TMDB',
              season: s.season_number,
              episode: ep.episode_number
            });
          }
        });
      });

      const windowSize = 5;
      const half = Math.floor(windowSize / 2);
      const withTrend = flat.map((d, i, arr) => {
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
          sum += arr[j].rating;
          count++;
        }
        return { ...d, trend: sum / count };
      });

      setEpData(withTrend);
    })();
    return () => { cancelled = true; };
  }, [seasons, details, epData, item.tmdb_id]);

  const seasonData = useMemo(() => {
    if (!seasons) return null;
    const flat = [];
    let globalIdx = 1;
    seasons.forEach((s, i) => {
      let rating = s.vote_average;
      if (epData) {
        const eps = epData.filter(e => e.season === s.season_number);
        if (eps.length > 0) {
          rating = eps.reduce((sum, e) => sum + e.rating, 0) / eps.length;
        }
      }
      if (rating > 0) {
        flat.push({
          index: globalIdx++,
          label: `S${s.season_number}`,
          name: s.name,
          rating: rating,
          season: s.season_number,
          isSeason: true
        });
      }
    });
    
    return flat.map((d, i, arr) => {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - 1); j <= Math.min(arr.length - 1, i + 1); j++) {
        sum += arr[j].rating;
        count++;
      }
      return { ...d, trend: sum / count };
    });
  }, [seasons, epData]);

  useEffect(() => {
    if (seasonData && onSeasonDataLoaded) {
      onSeasonDataLoaded(seasonData);
    }
  }, [seasonData, onSeasonDataLoaded]);

  if (!seasons) return null;

  const dataToRender = mode === 'episodes' ? epData : seasonData;
  const dataMax = dataToRender && dataToRender.length > 0 ? Math.max(...dataToRender.map(d => d.rating)) : 10;
  const dataMin = dataToRender && dataToRender.length > 0 ? Math.min(...dataToRender.map(d => d.rating)) : 0;
  const yDomainMin = Math.max(0, Math.floor(dataMin - 1));

  const seasonBounds = [];
  const seasonTicks = [];
  
  if (epData && mode === 'episodes') {
    seasons.forEach((s, i) => {
      const eps = epData.filter(e => e.season === s.season_number);
      if (eps.length === 0) return;
      const startIdx = eps[0].index;
      const endIdx = eps[eps.length - 1].index;
      seasonBounds.push({
        season: s.season_number,
        startIdx,
        endIdx,
        isEven: i % 2 === 0
      });
      seasonTicks.push({
        value: (startIdx + endIdx) / 2,
        label: `S${s.season_number}`
      });
    });
  }

  const formatXTick = (val) => {
    if (mode === 'seasons') {
      const point = dataToRender.find(d => d.index === val);
      return point ? point.label : '';
    }
    const tick = seasonTicks.find(t => Math.abs(t.value - val) < 0.1);
    return tick ? tick.label : '';
  };

  return (
    <div className="surface-panel" style={{ marginTop: 20, padding: '20px 24px', backgroundColor: '#131314', border: '1px solid #222' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select 
            value={mode} 
            onChange={e => setMode(e.target.value)}
            className="search-input"
            style={{ padding: '6px 12px', fontSize: 13, border: '1px solid #333', background: '#222', color: '#fff', borderRadius: 4 }}
          >
            <option value="episodes">Episodes</option>
            <option value="seasons">Seasons</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ccc' }}>
          Trendline
          <div 
            onClick={() => setShowTrendline(!showTrendline)}
            style={{ 
              width: 32, height: 18, borderRadius: 10, cursor: 'pointer',
              backgroundColor: showTrendline ? '#fff' : '#444',
              position: 'relative', transition: 'background 0.2s'
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: '50%', backgroundColor: showTrendline ? '#000' : '#888',
              position: 'absolute', top: 2, left: showTrendline ? 16 : 2, transition: 'left 0.2s'
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        {COLOR_BINS.map(bin => {
          const isGold = bin.label === '9.7+';
          return (
            <div key={bin.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#eee', fontWeight: 500 }}>
              <div style={{ 
                width: 10, height: 10, borderRadius: '50%', background: bin.color,
                boxShadow: isGold ? '0 0 12px 2px rgba(255, 215, 0, 0.9), 0 0 4px 1px rgba(255, 255, 255, 0.5)' : 'none'
              }} />
              {bin.label}
            </div>
          );
        })}
      </div>

      {!dataToRender && (
        <p style={{ color: 'var(--color-text-muted)', padding: '4rem 0', textAlign: 'center' }}>
          <Loader2 size={16} className="spin" style={{ verticalAlign: '-3px', marginRight: 8 }} />
          Loading ratings data…
        </p>
      )}

      {dataToRender && dataToRender.length > 0 && (
        <div style={{ height: 280, marginLeft: -15 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dataToRender} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <defs>
                <radialGradient id="godRays" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fffb00" stopOpacity="1" />
                  <stop offset="30%" stopColor="#ffd700" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#ffb300" stopOpacity="0" />
                </radialGradient>
                <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <CartesianGrid stroke="#222" vertical={false} />
              
              {seasonBounds.map(b => (
                <ReferenceArea 
                  key={b.season} 
                  x1={b.startIdx - 0.5} 
                  x2={b.endIdx + 0.5} 
                  fill={b.isEven ? 'rgba(255,255,255,0.02)' : 'transparent'} 
                />
              ))}

              <XAxis 
                dataKey="index" 
                type="number" 
                domain={['dataMin', 'dataMax']} 
                ticks={mode === 'episodes' ? seasonTicks.map(t => t.value) : dataToRender.map(d => d.index)}
                tickFormatter={formatXTick}
                tick={{ fill: '#888', fontSize: 11, fontWeight: 500 }} 
                axisLine={{ stroke: '#333' }}
                tickLine={false}
                padding={{ left: 10, right: 10 }}
              />
              
              <YAxis 
                domain={[yDomainMin, 10]} 
                tick={{ fill: '#888', fontSize: 11, fontWeight: 500, dx: -5 }}
                axisLine={false}
                tickLine={false}
                tickCount={10 - yDomainMin + 1}
              />
              
              <Tooltip 
                content={<GraphTooltip />} 
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '3 3' }} 
              />
              
              <Line 
                type="linear" 
                dataKey="rating" 
                stroke="rgba(255,255,255,0.2)" 
                strokeWidth={1} 
                dot={<CustomDot />} 
                activeDot={<CustomActiveDot />} 
                isAnimationActive={false}
              />

              {showTrendline && (
                <Line 
                  type="monotone" 
                  dataKey="trend" 
                  stroke="#aaa" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {dataToRender && dataToRender.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>No ratings available yet.</p>
      )}
    </div>
  );
}

function ShowListControls({ status, onMove, name, wokeOverrides, setWokeOverride, item }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
      {status !== 'watching' && (
        <button className="secondary-btn" style={{ fontSize: 13 }} onClick={() => onMove('watching', `▶ ${name} moved to Watching`)}>
          <Play size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Resume watching
        </button>
      )}
      {status !== 'watch_later' && (
        <button className="secondary-btn" style={{ fontSize: 13 }} onClick={() => onMove('watch_later', `🕓 ${name} moved to Watch Later`)}>
          <Clock size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Watch later
        </button>
      )}
      {status !== 'stopped' && (
        <button className="secondary-btn" style={{ fontSize: 13 }} onClick={() => onMove('stopped', `✋ Stopped watching ${name}`)}>
          <Ban size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Stop watching
        </button>
      )}
      {item && (
        <button className="secondary-btn" style={{ fontSize: 13 }} onClick={() => {
          const isWoke = wokeOverrides[String(item.tmdb_id || item.id)];
          setWokeOverride(item.tmdb_id || item.id, !isWoke);
        }}>
          <span className="icon">⚠️</span> {wokeOverrides[String(item.tmdb_id || item.id)] ? 'Unmark Woke' : 'Mark as Woke'}
        </button>
      )}
    </div>
  );
}

function ShowStats({ progress, stats }) {
  const { watched, total } = progress;
  const pct = total ? Math.min(100, Math.round((watched / total) * 100)) : 0;
  return (
    <div>
      <p style={{ marginBottom: 8 }}>Episodes watched: <strong>{watched}</strong> / {total || '?'} aired</p>
      {stats?.total > 0 && (
         <p style={{ marginBottom: 8, color: 'var(--color-coral)' }}>
          <img src="/mature_icon.jpg" alt="NSFW" style={{ width: 14, height: 14, borderRadius: 2, verticalAlign: '-2px', marginRight: 6 }} />
          Sex scenes tracked: <strong>{stats.total}</strong>
        </p>
      )}
      {total > 0 && (
        <div className="progress-track" style={{ position: 'static', height: 8, borderRadius: 4 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {total > 0 && watched >= total && (
        <p style={{ color: 'var(--color-cyan)', marginTop: 8 }}>All caught up! 🎉</p>
      )}
    </div>
  );
}

function MovieStats({ item, runtime, watchCount, onMarkWatched, sexScenes, addSexScene, removeSexScene }) {
  const [busy, setBusy] = useState(false);
  const [newTs, setNewTs] = useState('');
  const runtimeMins = runtime || (item.runtime ? Math.round(Number(item.runtime) / 60) : null);
  return (
    <div>
      <p>Watch count: <strong>{watchCount}</strong></p>
      {runtimeMins ? <p>Runtime: {runtimeMins} min</p> : null}
      {(item.watch_date || item.date) && watchCount > 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Last watched (import): {(item.watch_date || item.date).slice(0, 10)}</p>
      )}
      <button
        className="primary-btn"
        style={{ marginTop: 12, marginBottom: 20 }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try { await onMarkWatched(); } finally { setBusy(false); }
        }}
      >
        <Plus size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />
        {watchCount > 0 ? 'Mark watched again' : 'Mark watched'}
      </button>

      <div style={{ paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
        <h4 style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img src="/mature_icon.jpg" alt="NSFW" style={{ width: 14, height: 14, borderRadius: 2, verticalAlign: '-2px', marginRight: 4 }} />
            Sex Scenes ({sexScenes?.length || 0})
          </div>
        </h4>
        {sexScenes?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}>
            {sexScenes.map(s => (
              <li key={s.addedAt} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                <span>Timestamp: {s.timestamp || 'Unknown'}</span>
                <button className="tertiary-btn" style={{ padding: '0 4px' }} onClick={() => removeSexScene(item.tmdb_id || item.name, null, null, s)}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" className="search-input" placeholder="e.g. 14:30" value={newTs} onChange={e => setNewTs(e.target.value)} style={{ flex: 1, padding: '6px 10px', fontSize: 13 }} />
          <button className="secondary-btn" onClick={() => { addSexScene(item.tmdb_id || item.name, null, null, newTs); setNewTs(''); }}>Add</button>
        </div>
      </div>
    </div>
  );
}

function SeasonTracker({ item, watchedSet, imdbSeasons }) {
  const { markEpisode, unmarkEpisode, markEpisodesBulk, rewatchEpisodesBulk, getEpisodeWatchCount, rewatchEpisode, getShowSexSceneStats, getSexScenes, addSexScene, notify } = useData();
  const showId = String(item.tmdb_id || item.id);
  const [seasons, setSeasons] = useState(null);
  const [error, setError] = useState(false);
  const [openSeason, setOpenSeason] = useState(null);
  const [episodes, setEpisodes] = useState({}); // { [seasonNumber]: [...] }
  const [selectedEp, setSelectedEp] = useState(null); // { season, ep }
  const [details, setDetails] = useState(null);
  const [isScraping, setIsScraping] = useState(false);
  const sexStats = getShowSexSceneStats(showId);

  useEffect(() => {
    let cancelled = false;
    getShowDetails(item.tmdb_id)
      .then(d => { 
        if (!cancelled) {
          setSeasons(d.seasons); 
          setDetails(d);
        }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [item.tmdb_id]);

  const loadSeasonEps = async (seasonNumber) => {
    if (episodes[seasonNumber]) return episodes[seasonNumber];
    const eps = await getSeasonEpisodes(item.tmdb_id, seasonNumber);
    
    if (details?.imdb_id) {
       try {
         const imdbRatings = await getOmdbSeasonRatings(details.imdb_id, seasonNumber);
         if (imdbRatings) {
           eps.forEach(ep => {
             const score = imdbRatings[ep.episode_number];
             if (score) ep.imdb_rating = score;
           });
         }
       } catch (e) {}
    }
    
    setEpisodes(prev => ({ ...prev, [seasonNumber]: eps }));
    return eps;
  };

  const toggleSeason = async (seasonNumber) => {
    if (openSeason === seasonNumber) { setOpenSeason(null); return; }
    setOpenSeason(seasonNumber);
    try { await loadSeasonEps(seasonNumber); }
    catch (e) { console.error(e); setEpisodes(prev => ({ ...prev, [seasonNumber]: [] })); }
  };

  if (error) return null;
  if (!seasons) return <p style={{ marginTop: '2rem', color: 'var(--color-text-muted)' }}>Loading seasons…</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="season-tracker">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Seasons</h3>
        <button 
          className="secondary-btn" 
          style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          disabled={isScraping || !details?.imdb_id}
          onClick={async () => {
            if (!details?.imdb_id) return;
            setIsScraping(true);
            const foundEps = await scrapeImdbNudity(details.imdb_id);
            if (foundEps && foundEps.length > 0) {
              foundEps.forEach(ep => {
                const existing = getSexScenes(item.tmdb_id || item.id, ep.season, ep.episode);
                if (existing.length === 0) {
                  addSexScene(item.tmdb_id || item.name, ep.season, ep.episode, 'IMDb Auto-Scan');
                }
              });
              notify(`Auto-Scan Complete: Found and flagged ${foundEps.length} episodes with nudity/sex scenes from IMDb Parents Guide!`);
            } else {
              notify('Auto-Scan Complete: No episode-specific nudity timestamps found on IMDb for this show.');
            }
            setIsScraping(false);
          }}
        >
          {isScraping ? <Loader2 size={12} className="spin" /> : <Globe size={12} />}
          Auto-Scan IMDb
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {seasons.map(s => {
          const epNums = Array.from({ length: s.episode_count }, (_, i) => i + 1);
          const watchedInSeason = epNums.filter(e => watchedSet.has(epKey(s.season_number, e))).length;
          const seasonRewatches = epNums.reduce((sum, e) => {
            const c = getEpisodeWatchCount(item, s.season_number, e);
            return sum + Math.max(0, c - 1);
          }, 0);
          const complete = s.episode_count > 0 && watchedInSeason >= s.episode_count;
          const isOpen = openSeason === s.season_number;
          const eps = episodes[s.season_number];
          const imdbSeason = imdbSeasons?.find(sd => sd.season === s.season_number);
          const displayRating = imdbSeason ? imdbSeason.rating : s.vote_average;

          return (
            <div key={s.id} className="surface-panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="season-header" onClick={() => toggleSeason(s.season_number)}>
                {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span style={{ fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name || `Season ${s.season_number}`}
                </span>
                {displayRating > 0 && (
                  <span className="rating-badge" style={{ fontSize: 11, padding: '1px 8px' }} title={imdbSeason ? "IMDb season rating" : "TMDB season rating"}>
                    <Star size={10} fill="currentColor" style={{ verticalAlign: '-1px', marginRight: 3 }} />
                    {displayRating.toFixed(1)} {imdbSeason ? 'IMDb' : ''}
                  </span>
                )}
                {seasonRewatches > 0 && (
                  <span className="rewatch-badge" title={`${seasonRewatches} rewatches this season`}>
                    <RotateCcw size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />{seasonRewatches}
                  </span>
                )}
                {sexStats.bySeason[s.season_number] > 0 && (
                  <span className="rewatch-badge" style={{ backgroundColor: 'rgba(255, 77, 77, 0.15)', color: 'var(--color-coral)' }} title={`${sexStats.bySeason[s.season_number]} sex scenes in this season`}>
                    <img src="/mature_icon.jpg" alt="NSFW" style={{ width: 12, height: 12, borderRadius: 2, verticalAlign: '-1px', marginRight: 4 }} />
                    {sexStats.bySeason[s.season_number]}
                  </span>
                )}
                <span style={{ fontSize: 13, color: complete ? 'var(--color-cyan)' : 'var(--color-text-muted)', flexShrink: 0 }}>
                  {watchedInSeason} / {s.episode_count}
                </span>
                {watchedInSeason > 0 && (
                  <button
                    className="tertiary-btn"
                    style={{ fontSize: 12 }}
                    title="Log a rewatch of every watched episode in this season"
                    onClick={(e) => {
                      e.stopPropagation();
                      const eligible = epNums
                        .filter(ep => watchedSet.has(epKey(s.season_number, ep)))
                        .map(ep => ({ season: s.season_number, episode: ep }));
                      rewatchEpisodesBulk(showId, eligible,
                        `↻ ${s.name || `Season ${s.season_number}`} rewatch logged (${eligible.length} episodes)`);
                    }}
                  >
                    <RotateCcw size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />Rewatch
                  </button>
                )}
                {!complete && s.episode_count > 0 && (
                  <button
                    className="tertiary-btn"
                    style={{ fontSize: 12 }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      // only mark episodes that have actually aired
                      let seasonEps;
                      try { seasonEps = await loadSeasonEps(s.season_number); }
                      catch { return; }
                      const missing = seasonEps
                        .filter(ep => (!ep.air_date || ep.air_date <= today) && !watchedSet.has(epKey(s.season_number, ep.episode_number)))
                        .map(ep => ({ season: s.season_number, episode: ep.episode_number }));
                      if (missing.length) markEpisodesBulk(showId, missing,
                        `✓ ${s.name || `Season ${s.season_number}`} marked (${missing.length} episodes)`);
                    }}
                  >
                    Mark season
                  </button>
                )}
              </div>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--color-border)' }}>
                  {!eps && <p style={{ padding: 16, color: 'var(--color-text-muted)' }}><Loader2 size={14} className="spin" style={{ verticalAlign: '-2px', marginRight: 6 }} />Loading episodes…</p>}
                  {eps && eps.map(ep => {
                    const key = epKey(s.season_number, ep.episode_number);
                    const isWatched = watchedSet.has(key);
                    const watchCount = getEpisodeWatchCount(item, s.season_number, ep.episode_number);
                    const epSexCount = getSexScenes(item.tmdb_id || item.id, s.season_number, ep.episode_number).length;
                    const notAired = ep.air_date && ep.air_date > today;
                    return (
                      <div
                        key={ep.episode_number}
                        className="episode-row clickable"
                        style={notAired ? { opacity: 0.45 } : undefined}
                        onClick={() => setSelectedEp({ season: s, ep })}
                      >
                        <span style={{ color: 'var(--color-text-muted)', width: 36, flexShrink: 0 }}>E{ep.episode_number}</span>
                        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.name}</span>
                        {(ep.imdb_rating || ep.vote_average) > 0 && (
                          <span className="ep-rating" style={{ color: ep.imdb_rating ? '#f5c518' : undefined }} title={ep.imdb_rating ? 'IMDb Rating' : 'TMDB Rating'}>
                            <Star size={10} fill="currentColor" style={{ verticalAlign: '-1px', marginRight: 2 }} />
                            {(ep.imdb_rating || ep.vote_average).toFixed(1)}
                          </span>
                        )}
                        {epSexCount > 0 && (
                           <span className="rewatch-badge" style={{ backgroundColor: 'rgba(255, 77, 77, 0.15)', color: 'var(--color-coral)' }} title={`${epSexCount} sex scenes`}>
                             <img src="/mature_icon.jpg" alt="NSFW" style={{ width: 12, height: 12, borderRadius: 2, verticalAlign: '-1px', marginRight: 4 }} />
                             {epSexCount}
                           </span>
                        )}
                        {watchCount > 1 && (
                          <span className="rewatch-badge" title={`Watched ${watchCount} times`}>×{watchCount}</span>
                        )}
                        {ep.air_date && <span className="ep-air-date" style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 }}>{ep.air_date}</span>}
                        {isWatched && !notAired && (
                          <button
                            className="ep-rewatch"
                            title="Log a rewatch"
                            onClick={(e) => {
                              e.stopPropagation();
                              rewatchEpisode(showId, s.season_number, ep.episode_number,
                                `↻ Rewatch logged — S${s.season_number} E${ep.episode_number}`);
                            }}
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                        <button
                          className={`ep-check ${isWatched ? 'watched' : ''}`}
                          title={notAired ? `Airs ${ep.air_date}` : isWatched ? 'Mark unwatched' : 'Mark watched'}
                          disabled={notAired}
                          style={notAired ? { cursor: 'default' } : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isWatched) unmarkEpisode(showId, s.season_number, ep.episode_number);
                            else markEpisode(showId, s.season_number, ep.episode_number);
                          }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedEp && (
        <EpisodeModal
          item={item}
          showId={showId}
          season={selectedEp.season}
          ep={selectedEp.ep}
          watchedSet={watchedSet}
          onClose={() => setSelectedEp(null)}
        />
      )}
    </div>
  );
}

function EpisodeModal({ item, showId, season, ep, watchedSet, onClose }) {
  const { markEpisode, unmarkEpisode, rewatchEpisode, getEpisodeWatchCount, getSexScenes, addSexScene, removeSexScene } = useData();
  const [newTs, setNewTs] = useState('');
  const key = epKey(season.season_number, ep.episode_number);
  const isWatched = watchedSet.has(key);
  const watchCount = getEpisodeWatchCount(item, season.season_number, ep.episode_number);
  const scenes = getSexScenes(item.tmdb_id || item.id, season.season_number, ep.episode_number);
  const notAired = ep.air_date && ep.air_date > new Date().toISOString().slice(0, 10);
  const still = ep.still_path ? posterUrl(ep.still_path, 'w500') : null;

  return (
    <div className="episode-modal-backdrop" onClick={onClose}>
      <div className="episode-modal" onClick={e => e.stopPropagation()}>
        <button className="episode-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {still
          ? <img src={still} alt={ep.name} className="episode-still" />
          : <div className="episode-still placeholder">No preview available</div>
        }
        <div style={{ padding: '18px 20px 20px' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 2 }}>
            {item.name} · S{season.season_number} E{ep.episode_number}
          </p>
          <h3 style={{ fontSize: '1.35rem', marginBottom: 10 }}>{ep.name}</h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {ep.vote_average > 0 && (
              <span className="rating-badge">
                <Star size={12} fill="currentColor" style={{ verticalAlign: '-1px', marginRight: 4 }} />
                {ep.vote_average.toFixed(1)} <small>TMDB{ep.vote_count ? ` · ${ep.vote_count} votes` : ''}</small>
              </span>
            )}
            {ep.air_date && <span className="muted-pill">{notAired ? `Airs ${ep.air_date}` : ep.air_date}</span>}
            {ep.runtime && <span className="muted-pill">{ep.runtime} min</span>}
            {watchCount > 0 && <span className="rewatch-badge">watched ×{watchCount}</span>}
          </div>

          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 16 }}>
            {ep.overview || 'No synopsis available for this episode.'}
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!notAired && (
              <button
                className={isWatched ? 'secondary-btn' : 'primary-btn'}
                style={{ fontSize: 14 }}
                onClick={() => isWatched
                  ? unmarkEpisode(showId, season.season_number, ep.episode_number)
                  : markEpisode(showId, season.season_number, ep.episode_number,
                      `✓ ${item.name} — S${season.season_number} E${ep.episode_number} marked watched`)}
              >
                <Check size={15} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                {isWatched ? 'Mark unwatched' : 'Mark watched'}
              </button>
            )}
            {isWatched && (
              <button
                className="secondary-btn"
                style={{ fontSize: 14 }}
                onClick={() => rewatchEpisode(showId, season.season_number, ep.episode_number,
                  `↻ Rewatch logged — S${season.season_number} E${ep.episode_number}`)}
              >
                <RotateCcw size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Log rewatch
              </button>
            )}
          </div>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <h4 style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <img src="/mature_icon.jpg" alt="NSFW" style={{ width: 14, height: 14, borderRadius: 2, verticalAlign: '-2px', marginRight: 4 }} />
              Sex Scenes ({scenes.length})
            </h4>
            {scenes.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: 12 }}>
                {scenes.map(s => (
                  <li key={s.addedAt} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                    <span>Timestamp: {s.timestamp || 'Unknown'}</span>
                    <button className="tertiary-btn" style={{ padding: '0 4px' }} onClick={() => removeSexScene(item.tmdb_id || item.id, season.season_number, ep.episode_number, s)}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" className="search-input" placeholder="e.g. 14:30" value={newTs} onChange={e => setNewTs(e.target.value)} style={{ flex: 1, padding: '6px 10px', fontSize: 13 }} />
              <button className="secondary-btn" onClick={() => { addSexScene(item.tmdb_id || item.id, season.season_number, ep.episode_number, newTs); setNewTs(''); }}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Details;
