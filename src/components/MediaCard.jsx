import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { posterUrl } from '../api/tmdb';

// Shared poster card for shows and movies.
// quickCheck: { label, onClick, busy } — renders the TV Time-style "mark next watched" button.
// rating: optional score shown next to the meta line (ratingSource labels the tooltip).
function MediaCard({ item, type, overrides, meta, progressPct, quickCheck, rating, ratingSource, sexCount }) {
  const navigate = useNavigate();
  const itemId = String(item.tmdb_id || item.id || item.name);
  const overridePoster = overrides && overrides[itemId];
  const bgUrl = overridePoster || item.full_poster_url || posterUrl(item.poster_path);
  const hue = (item.name.length * 15) % 360;

  return (
    <div
      className="show-card"
      onClick={() => navigate(`/details/${type}/${itemId}`)}
      style={{ cursor: 'pointer' }}
    >
      <div className="show-poster" style={{
        background: bgUrl
          ? `url(${bgUrl}) center/cover`
          : `linear-gradient(135deg, hsl(${hue}, 40%, 20%), hsl(${hue}, 40%, 10%))`
      }}>
        {!bgUrl && <div className="show-title-overlay">{item.name}</div>}
        {sexCount > 0 && (
          <div style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(255, 77, 77, 0.9)', color: '#fff', fontSize: 11, fontWeight: 'bold', padding: '2px 6px', borderRadius: 12, zIndex: 10, backdropFilter: 'blur(4px)' }}>
            <img src="/mature_icon.jpg" alt="NSFW" style={{ width: 12, height: 12, borderRadius: 2, verticalAlign: '-2px', marginRight: 4 }} />
            {sexCount}
          </div>
        )}
        {quickCheck && (
          <button
            className="check-btn"
            title={quickCheck.label || 'Mark next episode watched'}
            disabled={quickCheck.busy}
            onClick={(e) => { e.stopPropagation(); quickCheck.onClick(); }}
          >
            {quickCheck.busy ? <Loader2 size={18} className="spin" /> : <Check size={18} />}
          </button>
        )}
        {typeof progressPct === 'number' && (
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        )}
      </div>
      <div className="show-info">
        <h4 className="show-name">{item.name}</h4>
        <p className="show-meta" style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
          {rating > 0 && (
            <span
              className={`ep-rating ${ratingSource === 'IMDb' ? 'imdb' : ''}`}
              style={{ fontSize: 12 }}
              title={ratingSource || undefined}
            >
              {ratingSource === 'IMDb' ? 'IMDb ' : '★ '}{rating.toFixed(1)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export default MediaCard;
