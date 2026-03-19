import { useParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useApi';
import { formatPrice, formatDate, dipColor, dipTextColor, sourceTag } from '../utils';

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: listing, loading, error } = useFetch(`/api/listings/${id}`, [id]);

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
  const hasDip = l.dip_percent > 0;
  const aedPerSqft = l.size_sqft ? Math.round(l.price_aed / l.size_sqft) : null;
  const barWidth = hasDip ? Math.round((l.price_aed / l.previous_price) * 100) : 0;

  return (
    <div className="min-h-screen bg-bg pb-8">
      {/* Back row */}
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-border">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-accent text-sm min-h-[44px]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Feed
        </button>
        <span className="text-[11px] font-mono text-muted">{sourceTag(l.source)}</span>
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

        {/* Price + dip */}
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{formatPrice(l.price_aed)}</span>
          {hasDip && (
            <span className={`text-sm font-bold px-2.5 py-1 rounded-full text-white ${dipColor(l.dip_percent)}`}>
              -{l.dip_percent}%
            </span>
          )}
        </div>

        {/* Metadata chips */}
        <div className="flex flex-wrap gap-2">
          {[
            (l.bedrooms === 0 || l.bedrooms === null) ? 'Studio' : `${l.bedrooms} Beds`,
            l.size_sqft ? `${l.size_sqft.toLocaleString()} sqft` : null,
            l.furnished,
            aedPerSqft ? `AED ${aedPerSqft.toLocaleString()}/sqft` : null,
          ].filter(Boolean).map(chip => (
            <span key={chip} className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs">{chip}</span>
          ))}
        </div>

        <div className="border-t border-border" />

        {/* Price comparison panel */}
        {hasDip && (
          <>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Price drop</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">Current price</div>
                  <div className="text-sm font-bold mt-0.5">{formatPrice(l.price_aed)}</div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">Previous price</div>
                  <div className="text-sm font-bold mt-0.5">{formatPrice(l.previous_price)}</div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">Drop amount</div>
                  <div className="text-sm font-bold mt-0.5 text-dip-red">-{formatPrice(l.dip_amount)}</div>
                </div>
                <div className="bg-card rounded-xl p-3">
                  <div className="text-[10px] text-muted">Drop date</div>
                  <div className="text-sm font-bold mt-0.5">{formatDate(l.price_changed_at)}</div>
                </div>
              </div>

              {/* Visual bar */}
              <div className="mt-3 space-y-1">
                <div className="h-6 rounded-lg bg-blue-900/30 relative overflow-hidden">
                  <div className="h-full rounded-lg bg-dip-red/40" style={{ width: `${barWidth}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted">
                  <span>AED 0</span>
                  <span>Now: {formatPrice(l.price_aed)}</span>
                  <span>Prev: {formatPrice(l.previous_price)}</span>
                </div>
              </div>

              {/* Comparison listing links */}
              {(l.previous_url || l.comparison?.url) && (
                <div className="mt-3 space-y-2">
                  {l.previous_url && (
                    <a href={l.previous_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-accent text-xs hover:underline">
                      → View previous listing{l.comparison?.source ? ` on ${l.comparison.source}` : ''}
                    </a>
                  )}
                  {l.comparison?.url && l.comparison.url !== l.previous_url && (
                    <a href={l.comparison.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-accent text-xs hover:underline">
                      → View compared listing{l.comparison.source ? ` on ${l.comparison.source}` : ''}
                      {l.comparison.property_name ? ` (${l.comparison.property_name})` : ''}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-border" />
          </>
        )}

        {/* Price history */}
        {l.price_history && l.price_history.length > 0 && (
          <>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Price history</div>
              <div className="space-y-2">
                {l.price_history.map((h, i) => {
                  const oldVal = parseInt(h.old_value, 10);
                  const newVal = parseInt(h.new_value, 10);
                  const change = oldVal - newVal;
                  const changePct = oldVal ? ((change / oldVal) * 100).toFixed(1) : 0;
                  const isDown = change > 0;
                  return (
                    <div key={i} className="bg-card rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">{formatDate(h.edited_at)}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          isDown ? 'bg-dip-red/20 text-dip-red' : 'bg-green-900/30 text-green-400'
                        }`}>
                          {isDown ? '↓' : '↑'} {Math.abs(changePct)}%
                        </span>
                      </div>
                      <div className="text-sm font-bold mt-1">AED {newVal?.toLocaleString()}</div>
                      <div className="text-[11px] text-muted">from AED {oldVal?.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border" />
          </>
        )}

        {/* Property details */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Property details</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Bathrooms', l.bathrooms],
              ['Furnished', l.furnished],
              ['Ready / Off-plan', l.ready_off_plan === 'ready' ? 'Ready' : l.ready_off_plan === 'off_plan' ? 'Off Plan' : l.ready_off_plan],
              l.distress ? ['Distress', l.distress] : null,
              ['Broker / Agency', l.broker_agency],
              ['Reference no', l.reference_no],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} className="bg-card rounded-xl p-3">
                <div className="text-[10px] text-muted">{label}</div>
                <div className="text-xs font-medium mt-0.5 truncate">{val || '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* External link */}
        {l.url && (
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-accent text-sm font-medium min-h-[44px]"
          >
            <span>→ View on {l.source}</span>
          </a>
        )}
      </div>
    </div>
  );
}
