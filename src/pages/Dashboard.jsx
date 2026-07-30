import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Flame, TrendingUp, Zap, CalendarDays, Trophy, RefreshCw, Repeat, Clapperboard, History } from 'lucide-react';
import { useData, parseEpKey } from '../context/DataContext';
import importedRewatches from '../rewatches.json';

// Days with more episodes than this are TV Time bulk-import stamps
// (e.g. account-creation day), not real binges — exclude them from records.
const BULK_DAY_THRESHOLD = 60;

// Sanctioned accent palette from design inspo (no #5865f2 — Discord-only per spec)
const COLORS = ['#00e5cc', '#ff4d4d', '#fbbf24', '#28c840', '#f0f4ff'];

const tooltipStyle = {
  backgroundColor: '#0a0f1a',
  border: '1px solid rgba(136,146,176,0.25)',
  borderRadius: 8,
  color: '#f0f4ff',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null; // "YYYY-MM"
}

function lastNMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

// hours → { years, months, days, hours }
function splitDuration(totalHours) {
  let hours = totalHours;
  const years = Math.floor(hours / (365.25 * 24));
  hours -= years * 365.25 * 24;
  const months = Math.floor(hours / (30.44 * 24));
  hours -= months * 30.44 * 24;
  const days = Math.floor(hours / 24);
  hours = Math.round(hours - days * 24);
  return { years, months, days, hours };
}

function durationText({ years, months, days, hours }) {
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours && !years) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  return parts.join(', ') || '0 hours';
}

function niceDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function Dashboard() {
  const { dashboard, shows, allShows, watchedMovies, progress, getWatchedSet, getShowProgress, getMovieWatchCount } = useData();

  const derived = useMemo(() => {
    // ---- Every raw watch event (import duplicates = rewatches, plus app-tracked) ----
    const events = []; // { date, showName, season, episode }
    allShows.forEach(show => {
      (show.episodes_seen || []).forEach(e => {
        if (e.date) events.push({ date: e.date, showName: show.name, season: e.season, episode: e.episode });
      });
    });
    Object.entries(progress).forEach(([id, p]) => {
      const show = allShows.find(s => String(s.tmdb_id || s.id) === id);
      Object.entries(p.episodes || {}).forEach(([, date]) => {
        events.push({ date, showName: show?.name || 'Unknown', season: 0, episode: 0 });
      });
    });
    // imported rewatches are real watch events too
    Object.entries(importedRewatches).forEach(([showName, eps]) => {
      Object.values(eps).forEach(({ count, date }) => {
        for (let i = 0; i < count; i++) events.push({ date, showName, season: 0, episode: 0 });
      });
    });

    // ---- Charts ----
    const epByMonth = {};
    const byDay = {};
    let firstDate = null;
    events.forEach(ev => {
      const k = monthKey(ev.date);
      if (k) epByMonth[k] = (epByMonth[k] || 0) + 1;
      const day = ev.date.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
      if (!firstDate || ev.date < firstDate) firstDate = ev.date;
    });

    // Weekday distribution, ignoring bulk-import stamp days
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    Object.entries(byDay).forEach(([day, n]) => {
      if (n > BULK_DAY_THRESHOLD) return;
      const d = new Date(day);
      if (!isNaN(d)) byWeekday[d.getDay()] += n;
    });

    const movieByMonth = {};
    watchedMovies.forEach(m => {
      const d = m.watch_date || m.date;
      const k = monthKey(d);
      if (k) movieByMonth[k] = (movieByMonth[k] || 0) + 1;
      if (d && (!firstDate || d < firstDate)) firstDate = d;
    });

    const months = lastNMonths(24);
    const chartData = months.map(m => ({
      month: m,
      episodes: epByMonth[m] || 0,
      movies: movieByMonth[m] || 0,
    }));
    const weekdayData = WEEKDAYS.map((name, i) => ({ name, episodes: byWeekday[i] }));

    // ---- Records (bulk-import stamp days excluded) ----
    let bingeDay = null;
    Object.entries(byDay).forEach(([day, n]) => {
      if (n > BULK_DAY_THRESHOLD) return;
      if (!bingeDay || n > bingeDay.count) bingeDay = { day, count: n };
    });

    let bingeMonth = null;
    Object.entries(epByMonth).forEach(([m, n]) => {
      if (!bingeMonth || n > bingeMonth.count) bingeMonth = { month: m, count: n };
    });

    // longest consecutive-day streak
    const dayList = Object.keys(byDay).sort();
    let streak = 0, bestStreak = 0, bestStreakEnd = null, prev = null;
    dayList.forEach(day => {
      if (prev && (new Date(day) - new Date(prev)) === 86400000) streak++;
      else streak = 1;
      if (streak > bestStreak) { bestStreak = streak; bestStreakEnd = day; }
      prev = day;
    });

    let bestWeekday = 0;
    byWeekday.forEach((n, i) => { if (n > byWeekday[bestWeekday]) bestWeekday = i; });

    // ---- Rewatches ----
    const totalEpisodes = allShows.reduce((n, s) => n + getWatchedSet(s).size, 0);
    const appRewatches = Object.values(progress)
      .reduce((n, p) => n + Object.values(p.rewatches || {}).reduce((a, b) => a + Math.max(0, b), 0), 0);
    const totalEvents = events.length + appRewatches;
    const totalRewatches = Math.max(0, totalEvents - totalEpisodes);

    // most rewatched episode (import duplicates + rewatched_episode.csv)
    const epCounts = {};
    allShows.forEach(show => {
      (show.episodes_seen || []).forEach(e => {
        const k = `${show.name}|S${e.season} E${e.episode}`;
        epCounts[k] = (epCounts[k] || 0) + 1;
      });
    });
    Object.entries(importedRewatches).forEach(([showName, eps]) => {
      Object.entries(eps).forEach(([key, { count }]) => {
        const se = parseEpKey(key);
        if (!se) return;
        const k = `${showName}|S${se.season} E${se.episode}`;
        epCounts[k] = (epCounts[k] || 0) + count;
      });
    });
    let topEpisode = null;
    Object.entries(epCounts).forEach(([k, n]) => {
      if (n > 1 && (!topEpisode || n > topEpisode.count)) {
        const [showName, ep] = k.split('|');
        topEpisode = { showName, ep, count: n };
      }
    });

    // most rewatched show (total rewatch events)
    const showRewatchTotals = {};
    Object.entries(importedRewatches).forEach(([showName, eps]) => {
      showRewatchTotals[showName] = Object.values(eps).reduce((a, e) => a + e.count, 0);
    });
    let topRewatchedShow = null;
    Object.entries(showRewatchTotals).forEach(([name, n]) => {
      if (!topRewatchedShow || n > topRewatchedShow.count) topRewatchedShow = { name, count: n };
    });

    // most rewatched movie
    let topMovie = null;
    watchedMovies.forEach(m => {
      const c = getMovieWatchCount(m);
      if (c > 1 && (!topMovie || c > topMovie.count)) topMovie = { name: m.name, count: c };
    });

    // hall of fame: top shows by total watch events
    const byShow = {};
    events.forEach(ev => { byShow[ev.showName] = (byShow[ev.showName] || 0) + 1; });
    const topShows = Object.entries(byShow)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // ---- Time ----
    const totalHours = dashboard.total_time_spent_hrs || 0;
    const movieHours = watchedMovies.reduce((sum, m) => {
      const rt = Number(m.runtime) || 0;
      const c = Math.max(1, getMovieWatchCount(m));
      return sum + (rt / 3600) * c;
    }, 0);
    const episodeHours = Math.max(0, totalHours - movieHours);

    let lifePct = null;
    if (firstDate) {
      const lifeHours = (Date.now() - new Date(firstDate).getTime()) / 3600000;
      if (lifeHours > 0) lifePct = (totalHours / lifeHours) * 100;
    }

    // catch-up projection
    const activeShows = [...shows.watch_next, ...shows.havent_watched];
    let remaining = 0;
    activeShows.forEach(s => {
      const { watched, total } = getShowProgress(s);
      if (total > watched) remaining += total - watched;
    });
    const last6 = months.slice(-6).reduce((sum, m) => sum + (epByMonth[m] || 0), 0);
    const perWeek = last6 / 26;
    const weeksToCatchUp = perWeek > 0 ? Math.ceil(remaining / perWeek) : null;

    return {
      chartData, weekdayData, totalEpisodes, totalRewatches, totalEvents,
      bingeDay, bingeMonth, bestStreak, bestStreakEnd, bestWeekday,
      topEpisode, topMovie, topShows, topRewatchedShow, firstDate,
      totalHours, movieHours, episodeHours, lifePct,
      remaining, perWeek, weeksToCatchUp,
    };
  }, [allShows, watchedMovies, progress, shows, getWatchedSet, getShowProgress, getMovieWatchCount, dashboard]);

  const genreData = Object.keys(dashboard.top_genres || {})
    .map(key => ({ name: key, value: dashboard.top_genres[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const networkData = Object.keys(dashboard.top_networks || {})
    .map(key => ({ name: key, value: dashboard.top_networks[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const dur = splitDuration(derived.totalHours);

  const statCard = (label, value, sub) => (
    <div className="surface-panel" style={{ padding: '1.25rem' }}>
      <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem', fontFamily: 'var(--font-body)' }}>{label}</h3>
      <p style={{ fontSize: '1.7rem', fontWeight: 'bold', color: 'var(--color-cyan)', lineHeight: 1.1 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  );

  const recordCard = (emoji, label, value, sub) => (
    <div className="surface-panel" style={{ padding: '1rem 1.25rem' }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{emoji} {label}</p>
      <p style={{ fontSize: '1.15rem', fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{sub}</p>}
    </div>
  );

  const maxShowCount = derived.topShows[0]?.count || 1;

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>Your Dashboard</h2>

      {/* THE headline number */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 77, 77, 0.05) 0%, rgba(10, 15, 26, 0.8) 50%, rgba(0, 229, 204, 0.03) 100%)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
        padding: '2rem 1.5rem', marginBottom: '1.5rem', textAlign: 'center',
      }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 6 }}>Total time spent watching</p>
        <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', lineHeight: 1.1, color: 'var(--color-cyan)' }}>
          {durationText(dur)}
        </p>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
          …of nonstop, no-sleep watching ({Math.round(derived.totalHours).toLocaleString()} hours)
          {derived.lifePct != null && derived.firstDate && (
            <> — that's <strong style={{ color: 'var(--color-ink)' }}>{derived.lifePct.toFixed(1)}%</strong> of
            your life since {niceDate(derived.firstDate)}</>
          )}
        </p>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {statCard('Episodes Watched', derived.totalEpisodes.toLocaleString(), `+ ${derived.totalRewatches.toLocaleString()} rewatches`)}
        {statCard('Movies Watched', watchedMovies.length.toLocaleString(), `≈ ${Math.round(derived.movieHours).toLocaleString()} hours`)}
        {statCard('Shows Tracked', allShows.length.toLocaleString())}
        {statCard('Series Time', `${Math.round(derived.episodeHours).toLocaleString()} h`, 'episodes only')}
      </div>

      {/* Records */}
      <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
        Your Records <Trophy size={18} color="#ffd700" />
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {derived.bingeDay && recordCard(<Flame size={20} color="var(--color-coral)" />, 'Biggest binge day', `${derived.bingeDay.count} episodes`, niceDate(derived.bingeDay.day))}
        {derived.bingeMonth && recordCard(<TrendingUp size={20} color="var(--color-cyan)" />, 'Biggest month', `${derived.bingeMonth.count} episodes`, derived.bingeMonth.month)}
        {derived.bestStreak > 1 && recordCard(<Zap size={20} color="#fbbf24" />, 'Longest daily streak', `${derived.bestStreak} days in a row`, `ended ${niceDate(derived.bestStreakEnd)}`)}
        {recordCard(<CalendarDays size={20} color="#a78bfa" />, 'Favourite watch day', WEEKDAYS[derived.bestWeekday], `${derived.weekdayData[derived.bestWeekday].episodes.toLocaleString()} episodes on ${WEEKDAYS[derived.bestWeekday]}s`)}
        {derived.topEpisode && recordCard(<RefreshCw size={20} color="var(--color-cyan)" />, 'Most rewatched episode', `${derived.topEpisode.count}× — ${derived.topEpisode.showName}`, derived.topEpisode.ep)}
        {derived.topRewatchedShow && recordCard(<Repeat size={20} color="#34d399" />, 'Most rewatched show', derived.topRewatchedShow.name, `${derived.topRewatchedShow.count} episode rewatches`)}
        {derived.topMovie && recordCard(<Clapperboard size={20} color="#f87171" />, 'Most rewatched movie', `${derived.topMovie.count}× — ${derived.topMovie.name}`)}
        {derived.firstDate && recordCard(<History size={20} color="#9ca3af" />, 'Tracking since', niceDate(derived.firstDate))}
      </div>

      {/* Hall of fame */}
      {derived.topShows.length > 0 && (
        <div className="surface-panel" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Hall of Fame — most watched shows</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {derived.topShows.map((s, i) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 22, color: 'var(--color-text-muted)', fontWeight: 700 }}>{i + 1}</span>
                <span style={{ flex: '0 0 40%', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{s.name}</span>
                <div style={{ flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.count / maxShowCount) * 100}%`, height: '100%', backgroundColor: COLORS[i % COLORS.length] }} />
                </div>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 13, flexShrink: 0 }}>{s.count} eps</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Perspective */}
      <div className="surface-panel" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>For perspective… 🤯</h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--color-text-muted)' }}>
          <li>✈️ You could have flown around the world <strong style={{ color: 'var(--color-ink)' }}>{Math.floor(derived.totalHours / 44.5).toLocaleString()}</strong> times (44.5h per lap).</li>
          <li>💍 That's the extended Lord of the Rings trilogy <strong style={{ color: 'var(--color-ink)' }}>{Math.floor(derived.totalHours / 11.4).toLocaleString()}</strong> times back to back.</li>
          <li>😴 Or <strong style={{ color: 'var(--color-ink)' }}>{Math.floor(derived.totalHours / 8).toLocaleString()}</strong> full nights of sleep.</li>
          <li>📚 Or roughly <strong style={{ color: 'var(--color-ink)' }}>{Math.floor(derived.totalHours / 6).toLocaleString()}</strong> novels read cover to cover.</li>
          <li>🍿 {dashboard.binge_2000_years_stat}</li>
        </ul>
      </div>

      {/* Catch-up Projection */}
      <div className="surface-panel" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>When will you catch up? 📅</h3>
        <p style={{ color: 'var(--color-text-muted)' }}>
          You have <strong style={{ color: 'var(--color-ink)' }}>{derived.remaining.toLocaleString()}</strong> unwatched
          aired episodes across your active shows.
        </p>
        {derived.weeksToCatchUp ? (
          <p style={{ marginTop: '0.5rem' }}>
            At your recent pace of <strong style={{ color: 'var(--color-cyan)' }}>{derived.perWeek.toFixed(1)} episodes/week</strong>,
            you'll catch up in about <strong style={{ color: 'var(--color-cyan)' }}>
              {derived.weeksToCatchUp > 104
                ? `${(derived.weeksToCatchUp / 52).toFixed(1)} years`
                : `${derived.weeksToCatchUp} weeks`}
            </strong>.
          </p>
        ) : (
          <p style={{ marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>
            No episodes watched in the last 6 months — start watching (or mark some episodes) to see a projection!
          </p>
        )}
      </div>

      {/* Activity charts */}
      <div className="surface-panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Viewing Activity (last 24 months)</h3>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={derived.chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <XAxis dataKey="month" tick={{ fill: 'rgb(90,100,128)', fontSize: 11 }} tickFormatter={m => m.slice(2)} interval={2} />
              <YAxis tick={{ fill: 'rgb(90,100,128)', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="episodes" name="Episodes" fill="#00e5cc" radius={[3, 3, 0, 0]} />
              <Bar dataKey="movies" name="Movies" fill="#ff4d4d" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="surface-panel">
          <h3 style={{ marginBottom: '1rem' }}>Watching by weekday</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={derived.weekdayData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgb(90,100,128)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgb(90,100,128)', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="episodes" name="Episodes" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-panel">
          <h3 style={{ marginBottom: '1rem' }}>Top Genres</h3>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genreData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {genreData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            {genreData.map((g, i) => (
              <span key={g.name} style={{ fontSize: '0.8rem', color: COLORS[i % COLORS.length] }}>● {g.name}</span>
            ))}
          </div>
        </div>

        <div className="surface-panel">
          <h3 style={{ marginBottom: '1rem' }}>Top Networks</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={networkData} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <XAxis type="number" tick={{ fill: 'rgb(90,100,128)', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'rgb(90,100,128)', fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="value" name="Shows" fill="#00e5cc" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
