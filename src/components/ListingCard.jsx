import { useNavigate } from 'react-router-dom';
import { formatDate, formatMonthYear, formatPrice, sourceTag } from '../utils';

export default function ListingCard({ listing, bookmarked, onToggleBookmark }) {
  const navigate = useNavigate();
  const l = listing;

  const isDecrease = l.change_pct != null && l.change_pct < 0;
  const isIncrease = l.change_pct != null && l.change_pct > 0;
  const absChangePct = l.change_pct != null ? Math.abs(l.change_pct).toFixed(1) : null;
  const absChangeAed = l.change_aed != null ? Math.abs(l.change_aed) : null;
  const hasChange = isDecrease || isIncrease;

  function handleBookmark(e) {
    e.stopPropagation();
    onToggleBookmark?.(l.id);
  }

  function handleViewLink(e) {
    e.stopPropagation();
  }

  return (
    <button
      onClick={() => navigate(`/listing/${l.id}`)}
      className="w-full bg-card rounded-xl p-4 text-left active:opacity-80 transition-opacity"
    >
      {/* Row 1: date + bookmark + change pill */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-mono text-muted">{formatDate(l.date_listed)}</span>
        <div className="flex items-center gap-2">
          {isDecrease && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(226,75,74,0.15)] border border-[rgba(226,75,74,0.4)] text-dip-red">
              −{absChangePct}%
            </span>
          )}
          {isIncrease && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(29,158,117,0.15)] border border-[rgba(29,158,117,0.4)] text-accent">
              +{absChangePct}%
            </span>
          )}
          <span onClick={handleBookmark} className="min-w-[28px] min-h-[28px] flex items-center justify-center">
            <svg className={`w-4 h-4 ${bookmarked ? 'text-accent fill-accent' : 'text-muted'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill={bookmarked ? 'currentColor' : 'none'}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </span>
        </div>
      </div>

      {/* Row 2: name + community */}
      <div className="font-semibold text-sm truncate">{l.property_name || l.community}</div>
      {l.property_name && (
        <div className="text-xs text-muted truncate">{l.community}</div>
      )}

      {/* Row 3: price */}
      <div className="mt-2">
        <span className="text-base font-bold">{formatPrice(l.price_aed)}</span>
      </div>

      {/* Row 4: beds · sqft · purpose · source */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-xs text-muted">
          {(l.bedrooms === 0 || l.bedrooms === null) ? 'Studio' : `${l.bedrooms}BR`} · {l.size_sqft?.toLocaleString()} sqft
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          l.purpose?.toLowerCase() === 'sale' ? 'bg-teal-900/50 text-teal-300' : 'bg-amber-900/50 text-amber-300'
        }`}>
          {l.purpose?.toLowerCase() === 'sale' ? 'Sale' : 'Rent'}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted">{sourceTag(l.source)}</span>
      </div>

      {/* Row 5: price change footer */}
      {isDecrease && (
        <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted">
          <span className="text-dip-red font-medium">−{formatPrice(absChangeAed)}</span>
          {' '}vs prev. {formatPrice(l.previous_price)} · {formatMonthYear(l.price_changed_at)}
        </div>
      )}
      {isIncrease && (
        <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted">
          <span className="text-accent font-medium">+{formatPrice(absChangeAed)}</span>
          {' '}vs prev. {formatPrice(l.previous_price)} · {formatMonthYear(l.price_changed_at)}
        </div>
      )}

      {/* Row 6: view on source link */}
      {l.url && (
        <a
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleViewLink}
          className={`${hasChange ? '' : 'mt-2 pt-2 border-t border-border '}text-[11px] text-accent flex items-center gap-1 hover:underline ${hasChange ? 'mt-1' : ''}`}
        >
          → View on {l.source}
        </a>
      )}
    </button>
  );
}
