import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchListing } from '../api/client';
import DipBadge from '../components/ui/DipBadge';
import SkeletonCard from '../components/ui/SkeletonCard';
import ErrorState from '../components/ui/ErrorState';
import { formatPrice, formatFullDate, bedroomLabel, timeAgo } from '../utils/formatters';

export default function DetailPage() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchListing(id)
      .then(data => { setListing(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="p-4 flex flex-col gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error || !listing) {
    return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  }

  const {
    property_name, location, city, property_type, listing_type, current_price,
    // Dip 1 — new names
    change_pct, change_aed, previous_price, price_changed_at,
    dip_prev_source, dip_prev_size, dip_prev_furnished, dip_prev_url,
    // Dip 1 — legacy names
    dip_percent, dip_amount, last_txn_price, last_txn_date,
    // Dip 2 — Listing Change
    listing_change,
    // Comparison object (from detail endpoint)
    comparison,
    bedrooms, bathrooms, size_sqft,
    furnished, source, listing_url, scraped_at, date_listed,
    txn_history = [], price_history = [],
  } = listing;

  // Use new field names, fall back to legacy
  const dipPct = change_pct ?? dip_percent;
  const dipAed = change_aed ?? dip_amount;
  const prevPrice = comparison?.price ?? previous_price ?? last_txn_price;
  const prevDate = comparison?.date ?? price_changed_at ?? last_txn_date;
  const prevSource = comparison?.source ?? dip_prev_source;
  const prevSize = comparison?.size ?? dip_prev_size;
  const prevFurnished = comparison?.furnished ?? dip_prev_furnished;
  const prevUrl = comparison?.url ?? dip_prev_url;

  const sourceTag = source?.includes('Property') ? 'PF' : source === 'Bayut' ? 'BY' : source?.slice(0, 3)?.toUpperCase();
  const barWidth = prevPrice ? Math.min((current_price / prevPrice) * 100, 100) : 100;
  const isSale = listing_type === 'Sale';

  return (
    <div className="flex flex-col pb-8">
      {/* Back row */}
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-1 text-sm text-brand-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Feed
        </Link>
        <span className="font-mono text-xs text-gray-500 bg-brand-900/60 px-2 py-0.5 rounded">
          {sourceTag}
        </span>
      </div>

      {/* Hero */}
      <div className="px-4 mb-4">
        <h1 className="text-lg font-bold text-gray-100 mb-1">{property_name || 'Unknown Building'}</h1>
        <p className="text-sm text-gray-500">
          {location}{city ? `, ${city}` : ''} · {property_type} · {' '}
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            isSale ? 'bg-brand-700/30 text-brand-400' : 'bg-amber-500/15 text-amber-400'
          }`}>
            {listing_type || 'Sale'}
          </span>
        </p>
        <p className="text-xs text-gray-600 mt-1">Listed {timeAgo(date_listed || scraped_at)}</p>
      </div>

      {/* Price row */}
      <div className="px-4 flex items-center gap-3 mb-4">
        <span className="text-2xl font-bold text-gray-100">{formatPrice(current_price)}</span>
        {dipPct != null && <DipBadge percent={dipPct} size="lg" />}
        {listing_change != null && listing_change !== 0 && (
          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
            listing_change < 0 ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'
          }`}>
            {listing_change < 0 ? '↓' : '↑'} AED {Math.abs(listing_change).toLocaleString()}
          </span>
        )}
      </div>

      {/* Metadata chips */}
      <div className="px-4 flex gap-2 mb-4 flex-wrap">
        {[
          bedroomLabel(bedrooms),
          bathrooms ? `${bathrooms} Bath` : null,
          size_sqft ? `${size_sqft.toLocaleString()} sqft` : null,
          size_sqft && current_price ? `AED ${Math.round(current_price / size_sqft).toLocaleString()}/sqft` : null,
          furnished || null,
        ].filter(Boolean).map((chip, i) => (
          <span key={i} className="text-xs bg-brand-900/60 text-gray-400 px-2.5 py-1 rounded-lg">
            {chip}
          </span>
        ))}
      </div>

      {/* Dip 1 — vs Prior Listing */}
      {dipPct != null && (
        <>
          <div className="mx-4 border-t border-brand-800 my-2" />
          <div className="px-4 my-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-3">vs Prior Listing</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Current listing price</p>
                <p className={`text-sm font-semibold ${dipAed < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatPrice(current_price)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Prior listing price</p>
                <p className="text-sm font-semibold text-gray-400">{formatPrice(prevPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Difference</p>
                <p className={`text-sm font-semibold ${dipAed < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {dipAed < 0 ? '−' : '+'}AED {Math.abs(dipAed)?.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 mb-1">Prior listing date</p>
                <p className="text-sm font-semibold text-gray-400">{formatFullDate(prevDate)}</p>
              </div>
            </div>
            {prevSource && (
              <div className="flex gap-3 text-[10px] text-gray-500 mb-3">
                {prevSource && <span>Source: {prevSource}</span>}
                {prevSize && <span>Size: {prevSize?.toLocaleString()} sqft</span>}
                {prevFurnished && <span>{prevFurnished}</span>}
              </div>
            )}
            {prevUrl && (
              <a href={prevUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400">
                → View prior listing
              </a>
            )}

            {/* Delta bar */}
            <div className="relative mt-3">
              <div className="h-2 bg-brand-800 rounded-full w-full">
                <div className="h-2 bg-blue-500/40 rounded-full w-full absolute top-0 left-0" />
                <div
                  className={`h-2 ${dipAed < 0 ? 'bg-red-500/60' : 'bg-green-500/60'} rounded-full absolute top-0 left-0`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-gray-600">
                <span>AED 0</span>
                <span className={dipAed < 0 ? 'text-red-400' : 'text-green-400'}>Current: {formatPrice(current_price)}</span>
                <span className="text-blue-400">Prior: {formatPrice(prevPrice)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dip 2 — Listing Change */}
      {listing_change != null && listing_change !== 0 && (
        <>
          <div className="mx-4 border-t border-brand-800 my-2" />
          <div className="px-4 my-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-3">Listing Price Change</p>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold ${listing_change < 0 ? 'text-red-400' : 'text-green-400'}`}>
                {listing_change < 0 ? '↓' : '↑'} AED {Math.abs(listing_change).toLocaleString()}
              </span>
              <span className="text-xs text-gray-500">
                since first listed
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">
              This listing's price has {listing_change < 0 ? 'decreased' : 'increased'} by AED {Math.abs(listing_change).toLocaleString()} since it was first scraped.
            </p>
          </div>
        </>
      )}

      {/* Transaction history — only when txn data exists */}
      {(txn_history.length > 0 || last_txn_price) && (
        <>
          <div className="mx-4 border-t border-brand-800 my-2" />
          <div className="px-4 my-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-3">
              {txn_history.length > 0 ? 'Sale history' : 'Last sale'}
            </p>
            <div className="flex flex-col gap-2">
              {/* Current listing row */}
              <div className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-gray-300">Current listing</p>
                  <p className="text-[10px] text-gray-500">{formatFullDate(scraped_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-200">{formatPrice(current_price)}</p>
                  <span className="text-[9px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">current</span>
                </div>
              </div>

              {/* DLD transactions */}
              {txn_history.map((txn, i) => {
                const isRef = i === 0;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                      isRef ? 'bg-blue-500/5 border border-blue-500/10' : 'bg-brand-900/40'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-300">{txn.txn_type || 'Sale'}</p>
                      <p className="text-[10px] text-gray-500">{formatFullDate(txn.txn_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-200">{formatPrice(txn.txn_price_aed)}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        isRef ? 'bg-blue-500/15 text-blue-400' : 'bg-gray-500/15 text-gray-500'
                      }`}>
                        {isRef ? 'last sale' : 'historical'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="mx-4 border-t border-brand-800 my-2" />

      {/* External link */}
      {listing_url && (
        <div className="px-4 mt-4">
          <a
            href={listing_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-brand-400 font-medium"
          >
            → View on {source}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
