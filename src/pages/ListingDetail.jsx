import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useApi';
import SEO from '../components/SEO';
import SharePopover from '../components/SharePopover';
import { formatPrice, formatDate, sourceTag } from '../utils';
import { trackPropertyView, trackClick } from '../lib/analytics';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: listing, loading, error } = useFetch(`/api/listings/${id}`, [id]);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (listing) trackPropertyView(listing.id, listing.property_name || listing.community, {
      community: listing.community,
      url: listing.url,
      price: listing.price_aed,
      change_pct: listing.change_pct,
      purpose: listing.purpose,
      ready_off_plan: listing.ready_off_plan,
    });
  }, [listing]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg p-4 space-y-4">
        <div className="skeleton h-6 w-20" />
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-48" />
        <div className="skeleton h-10 w-40" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-bg p-4 text-center pt-20">
        <div className="text-muted mb-2">Couldn't load listing</div>
        <button onClick={() => navigate('/')} className="bg-accent text-white px-4 py-2 rounded-xl text-sm">
          Back to Feed
        </button>
      </div>
    );
  }

  const l = listing;
  const isDecrease = l.change_pct != null && l.change_pct < 0;
  const isIncrease = l.change_pct != null && l.change_pct > 0;
  // PRD: previous_price != null && change_aed != null
  const hasChange = l.previous_price != null && l.change_aed != null;
  const absChangePct = l.change_pct != null ? Math.abs(l.change_pct).toFixed(1) : null;
  const absChangeAed = l.change_aed != null ? Math.abs(l.change_aed) : null;
  const aedPerSqft = l.size_sqft ? Math.round(l.price_aed / l.size_sqft) : null;

  // Same-listing price change
  const hasSameListingChange = l.listing_change != null && l.listing_change !== 0;
  const sameDecrease = hasSameListingChange && l.listing_change < 0;

  // Listing vs Last Sale — PRD: last_sale_price != null && last_sale_date != null
  const hasLastSale = l.last_sale_price != null && l.last_sale_date != null;
  const saleChange = l.last_sale_change;
  const saleDecrease = hasLastSale && saleChange != null && saleChange < 0;

  const linkStyle = "flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-accent text-sm font-medium min-h-[44px]";

  return (
    <div className="min-h-screen bg-bg pb-8">
      <SEO title={l.property_name || l.community} description={`${l.property_name || l.community} — view price history and comparable transactions.`} noindex={true} />
      {/* Back row */}
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-border">
        <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} className="flex items-center gap-1 text-accent text-sm min-h-[44px]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Feed
        </button>
        <div className="flex items-center gap-3">
          <button onClick={() => { trackClick('share', { property_id: l.id }); setShareOpen(!shareOpen); }} className="relative p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
            {shareOpen && <SharePopover listing={l} onClose={() => setShareOpen(false)} />}
          </button>
          <span className="text-[11px] font-mono text-muted">{sourceTag(l.source)}</span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold">{l.property_name || l.community}</h1>
          <div className="text-sm text-muted mt-0.5">
            {[l.community, l.type, l.purpose?.toLowerCase() === 'sale' ? 'Sale' : 'Rent'].filter(Boolean).join(' · ')}
          </div>
          <div className="text-xs text-muted mt-1">Listed {formatDate(l.date_listed)}</div>
        </div>

        {/* Price + change badge */}
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{formatPrice(l.price_aed)}</span>
          {isDecrease && (
            <span className="text-sm font-bold px-2.5 py-1 rounded-full bg-[rgba(226,75,74,0.15)] border border-[rgba(226,75,74,0.4)] text-dip-red">
              −{absChangePct}%
            </span>
          )}
          {isIncrease && (
            <span className="text-sm font-bold px-2.5 py-1 rounded-full bg-[rgba(29,158,117,0.15)] border border-[rgba(29,158,117,0.4)] text-accent">
              +{absChangePct}%
            </span>
          )}
        </div>

        {/* Property detail tags */}
        <div className="flex flex-wrap gap-2">
          {(() => {
            const readyLabel = l.ready_off_plan === 'ready' || l.ready_off_plan === 'Ready' ? 'Ready'
              : (l.ready_off_plan === 'off_plan' || l.ready_off_plan === 'Off Plan') ? 'Off Plan'
              : l.ready_off_plan || null;
            const isReady = readyLabel === 'Ready';
            const chips = [
              (l.bedrooms === 0 || l.bedrooms === null) ? 'Studio' : `${l.bedrooms} Beds`,
              l.size_sqft ? `${l.size_sqft.toLocaleString()} sqft` : null,
              l.furnished,
              aedPerSqft ? `AED ${aedPerSqft.toLocaleString()}/sqft` : null,
              l.bathrooms != null ? `${l.bathrooms} Baths` : null,
              l.type || null,
              l.purpose?.toLowerCase() === 'sale' ? 'Sale' : l.purpose?.toLowerCase() === 'rent' ? 'Rent' : null,
            ].filter(Boolean);
            return (
              <>
                {readyLabel && (
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-medium ${isReady ? 'bg-accent/20 border border-accent/40 text-accent' : 'bg-amber-900/30 border border-amber-500/40 text-amber-300'}`}>{readyLabel}</span>
                )}
                {chips.map(chip => (
                  <span key={chip} className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">{chip}</span>
                ))}
              </>
            );
          })()}
        </div>

        <div className="border-t border-border" />

        {/* Price history chain */}
        {l.price_history && l.price_history.length >= 2 && (
          <>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Same listing price history</div>
              <div className="flex items-center flex-wrap gap-y-2">
                {l.price_history.map((h, i) => {
                  const isCurrent = h.id === l.id;
                  return (
                    <div key={h.id} className="flex items-center">
                      {i > 0 && <span className="text-muted text-xs px-2">→</span>}
                      <div className={`text-center rounded-xl px-3 py-2 ${isCurrent ? 'bg-accent/10 border border-accent/30' : 'bg-card'}`}>
                        <div className={`text-sm font-bold ${isCurrent ? 'text-accent' : ''}`}>{formatPrice(h.price)}</div>
                        <div className="text-[10px] text-muted">{formatDate(h.date, true)}</div>
                        {isCurrent && <div className="text-[9px] text-accent mt-0.5">current</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border" />
          </>
        )}

        {/* Same-listing price change — removed: already visible in price history chain above */}

        {/* Cross-listing price change panel */}
        {hasChange && (
          <>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Listing vs. listing</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">Previous price</div>
                  <div className="text-sm font-bold mt-0.5">{formatPrice(l.previous_price)}</div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">{l.change_aed < 0 ? 'Decreased by' : 'Increased by'}</div>
                  <div className={`text-sm font-bold mt-0.5 ${l.change_aed < 0 ? 'text-dip-red' : 'text-accent'}`}>
                    {l.change_aed < 0 ? '−' : '+'}{formatPrice(absChangeAed)}
                  </div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">Change date</div>
                  <div className="text-sm font-bold mt-0.5">{formatDate(l.price_changed_at)}</div>
                </div>
              </div>

              {/* Comparison listing links */}
              {(l.previous_url || l.comparison?.url) && (
                <div className="mt-3 space-y-2">
                  {l.previous_url && (
                    <a href={l.previous_url} target="_blank" rel="noopener noreferrer" className={linkStyle}>
                      → View previous listing{l.comparison?.source ? ` on ${l.comparison.source}` : ''}
                    </a>
                  )}
                  {l.comparison?.url && l.comparison.url !== l.previous_url && (
                    <a href={l.comparison.url} target="_blank" rel="noopener noreferrer" className={linkStyle}>
                      → View compared listing{l.comparison.source ? ` on ${l.comparison.source}` : ''}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border" />
          </>
        )}

        {/* Listing vs Last Sale/Rent */}
        {hasLastSale && (
          <>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">
                {l.purpose?.toLowerCase() === 'rent' ? 'Listing vs. Last Rent' : 'Listing vs. Last Sale'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">{l.purpose?.toLowerCase() === 'rent' ? 'Last rent' : 'Last DLD sale'}</div>
                  <div className="text-sm font-bold mt-0.5">{formatPrice(l.last_sale_price)}</div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">{saleDecrease ? (l.purpose?.toLowerCase() === 'rent' ? 'Below rent by' : 'Below sale by') : (l.purpose?.toLowerCase() === 'rent' ? 'Above rent by' : 'Above sale by')}</div>
                  <div className={`text-sm font-bold mt-0.5 ${saleDecrease ? 'text-dip-red' : 'text-accent'}`}>
                    {saleDecrease ? '−' : '+'}{formatPrice(Math.abs(saleChange))}
                  </div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">{l.purpose?.toLowerCase() === 'rent' ? 'Rent date' : 'Sale date'}</div>
                  <div className="text-sm font-bold mt-0.5">{formatDate(l.last_sale_date)}</div>
                </div>
                {l.last_sale_size != null && (
                  <div className="bg-card rounded-xl p-3">
                    <div className="text-[10px] text-muted">Transaction size</div>
                    <div className="text-sm font-bold mt-0.5">{l.last_sale_size.toLocaleString()} sqft</div>
                  </div>
                )}
              </div>
              {l.last_sale_type && (
                <div className="mt-2 text-[11px] text-muted">
                  {l.purpose?.toLowerCase() === 'rent' ? 'Source:' : 'Transaction:'} {l.last_sale_type}
                </div>
              )}
              <div className="mt-3">
                <a href="https://data.realvaluer.ai" target="_blank" rel="noopener noreferrer" className={linkStyle}>
                  → View DLD Transactions via Data.RealValuer.ai
                </a>
              </div>
            </div>
            <div className="border-t border-border" />
          </>
        )}

        {/* Property details */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Property details</div>
          {(l.broker_agency || l.reference_no) && (
            <div className="space-y-1.5 mb-3">
              {l.broker_agency && (
                <div className="text-xs"><span className="text-muted">Broker / Agency:</span> <span className="font-medium">{l.broker_agency}</span></div>
              )}
              {l.reference_no && (
                <div className="text-xs"><span className="text-muted">Reference no:</span> <span className="font-medium">{l.reference_no}</span></div>
              )}
            </div>
          )}
        </div>

        {/* External link */}
        {l.url && (
          <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => trackClick('view_external', { source: l.source, property_id: l.id })} className={linkStyle}>
            → View on {l.source}
          </a>
        )}
      </div>
    </div>
  );
}
