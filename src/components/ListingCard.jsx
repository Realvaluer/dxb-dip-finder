import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatPrice, sourceTag } from '../utils';
import { trackClick } from '../lib/analytics';
import SharePopover from './SharePopover';

export default function ListingCard({ listing, bookmarked, onToggleBookmark }) {
  const navigate = useNavigate();
  const l = listing;

  // Pill shows transaction % only (no fallback — hide if no transaction match)
  const displayPct = l.last_sale_change_pct;
  const isDecrease = displayPct != null && displayPct < 0;
  const isIncrease = displayPct != null && displayPct > 0;
  const absChangePct = displayPct != null ? Math.abs(displayPct).toFixed(1) : null;

  // Same Listing change — PRD: listing_change != null && listing_change !== 0 (both directions)
  const hasSameListing = l.listing_change != null && l.listing_change !== 0;

  // Previous Listing — PRD: previous_price != null && change_aed != null
  const hasPrevListing = l.previous_price != null && l.change_aed != null;
  const prevIsNeg = hasPrevListing && l.change_aed < 0;

  // Last Sale/Rent (transaction data)
  const hasLastSale = l.last_sale_price != null && l.last_sale_date != null;
  const saleIsNeg = hasLastSale && l.last_sale_change != null && l.last_sale_change < 0;
  const hasAnyComparison = hasSameListing || hasPrevListing || hasLastSale;

  const [shareOpen, setShareOpen] = useState(false);

  function handleBookmark(e) {
    e.stopPropagation();
    trackClick('bookmark', { property_id: l.id });
    onToggleBookmark?.(l.id);
  }

  function handleShare(e) {
    e.stopPropagation();
    trackClick('share', { property_id: l.id });
    setShareOpen(!shareOpen);
  }

  function handleViewLink(e) {
    e.stopPropagation();
    trackClick('view_external', { source: l.source, property_id: l.id });
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
          <span className="relative" onClick={handleShare}>
            <span className="min-w-[28px] min-h-[28px] flex items-center justify-center">
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
            </span>
            {shareOpen && <SharePopover listing={l} onClose={() => setShareOpen(false)} />}
          </span>
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
        {l.type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-900/30 text-blue-300">
            {l.type}
          </span>
        )}
        {(() => {
          const rop = l.ready_off_plan?.toLowerCase();
          if (rop === 'ready') return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-900/25 text-purple-300">Ready</span>;
          if (rop === 'off_plan' || rop === 'off plan' || rop === 'off-plan') return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-900/25 text-orange-300">Off Plan</span>;
          return null;
        })()}
        <span className="ml-auto text-[10px] font-mono text-muted">{sourceTag(l.source)}</span>
      </div>

      {/* Line 0: Same Listing (price dropped on same listing) */}
      {hasSameListing && (
        <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted">
          <span className="font-semibold text-white">Same Listing:</span>{' '}
          <span className={l.listing_change < 0 ? 'text-dip-red font-medium' : 'text-accent font-medium'}>
            {l.listing_change < 0 ? '−' : '+'}{formatPrice(Math.abs(l.listing_change))}
          </span>
          {l.listing_change_prev_price != null && <> · Prev: {formatPrice(l.listing_change_prev_price)}</>}
        </div>
      )}

      {/* Line 1: Previous Listing */}
      {hasPrevListing && (
        <div className={`${hasSameListing ? 'mt-1' : 'mt-2 pt-2 border-t border-border'} text-[11px] text-muted`}>
          <span className="font-semibold text-white">Prev Listing:</span>{' '}
          <span className={prevIsNeg ? 'text-dip-red font-medium' : 'text-accent font-medium'}>
            {prevIsNeg ? '−' : '+'}{formatPrice(Math.abs(l.change_aed))}
          </span>
          {l.previous_price != null && <> · {formatPrice(l.previous_price)}</>}
          {l.dip_prev_size != null && <> · {Math.round(Number(l.dip_prev_size)).toLocaleString()} sqft</>}
          {l.price_changed_at && <> · {formatDate(l.price_changed_at, true)}</>}
        </div>
      )}

      {/* Line 2: Last Sale/Rent */}
      {hasLastSale && (
        <div className={`${(hasSameListing || hasPrevListing) ? 'mt-1' : 'mt-2 pt-2 border-t border-border'} text-[11px] text-muted`}>
          <span className="font-semibold text-white">{l.purpose?.toLowerCase() === 'rent' ? 'Last Rent:' : 'Last Sale:'}</span>{' '}
          <span className={saleIsNeg ? 'text-dip-red font-medium' : 'text-accent font-medium'}>
            {saleIsNeg ? '−' : '+'}{formatPrice(Math.abs(l.last_sale_change))}
          </span>
          {' '}· {formatPrice(l.last_sale_price)}
          {l.last_sale_size != null && <> · {Math.round(Number(l.last_sale_size)).toLocaleString()} sqft</>}
          {l.last_sale_date && <> · {formatDate(l.last_sale_date, true)}</>}
        </div>
      )}

      {/* Row 6: view on source link */}
      {l.url && (
        <a
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleViewLink}
          className={`${hasAnyComparison ? '' : 'mt-2 pt-2 border-t border-border '}text-[11px] text-accent flex items-center gap-1 hover:underline ${hasAnyComparison ? 'mt-1' : ''}`}
        >
          → View on {l.source}
        </a>
      )}
    </button>
  );
}
