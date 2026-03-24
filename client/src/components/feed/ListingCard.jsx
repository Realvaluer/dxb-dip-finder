import { Link } from 'react-router-dom';
import DipBadge from '../ui/DipBadge';
import { formatPrice, formatFullDate, bedroomLabel } from '../../utils/formatters';

export default function ListingCard({ listing }) {
  const {
    id, property_name, location, bedrooms, size_sqft,
    current_price, source, date_listed, scraped_at, listing_type,
    // Dip 1 — vs Prior Listing
    change_pct, change_aed, previous_price, price_changed_at,
    // Dip 2 — Listing Change (same ref price change)
    listing_change,
    // Legacy field names (backward compat)
    dip_percent, dip_amount, last_txn_price, last_txn_date,
  } = listing;

  // Use new field names, fall back to legacy
  const dipPct = change_pct ?? dip_percent;
  const dipAed = change_aed ?? dip_amount;
  const prevPrice = previous_price ?? last_txn_price;
  const prevDate = price_changed_at ?? last_txn_date;

  const sourceTag = source?.includes('Property') ? 'PF' : source === 'Bayut' ? 'BY' : source?.slice(0, 3)?.toUpperCase();
  const displayDate = formatFullDate(date_listed || scraped_at);
  const isSale = listing_type === 'Sale';

  return (
    <Link
      to={`/listing/${id}`}
      className="block bg-brand-900/40 rounded-xl p-4 active:bg-brand-900/60 transition-colors"
    >
      {/* Date + dip badges */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-gray-600">{displayDate}</span>
        <div className="flex gap-1.5 items-center">
          {listing_change != null && listing_change !== 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              listing_change < 0 ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'
            }`}>
              {listing_change < 0 ? '↓' : '↑'} AED {Math.abs(listing_change).toLocaleString()}
            </span>
          )}
          {dipPct != null && <DipBadge percent={dipPct} />}
        </div>
      </div>

      {/* Building name */}
      <h3 className="text-[15px] font-bold text-gray-200 line-clamp-1 mb-0.5">
        {property_name || 'Unknown Building'}
      </h3>

      {/* Community name */}
      <p className="text-[13px] text-gray-500 mb-2">{location || 'Unknown Area'}</p>

      {/* Price */}
      <p className="text-lg font-medium text-gray-100 mb-2">
        {formatPrice(current_price)}
      </p>

      {/* Metadata row */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
        <span>{bedroomLabel(bedrooms)}</span>
        <span>·</span>
        <span>{size_sqft?.toLocaleString()} sqft</span>
        <span>·</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          isSale ? 'bg-brand-700/30 text-brand-400' : 'bg-amber-500/15 text-amber-400'
        }`}>
          {listing_type || 'Sale'}
        </span>
        <span className="ml-auto font-mono text-[10px] text-gray-600 shrink-0">
          {sourceTag}
        </span>
      </div>

      {/* Dip rows */}
      <div className="flex flex-col gap-1">
        {/* Dip 1 — vs Prior Listing */}
        {dipPct != null && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-600 text-[10px] w-[70px] shrink-0">vs Prior</span>
            <span className={dipAed < 0 ? 'text-red-400' : 'text-green-400'}>
              {dipAed < 0 ? '−' : '+'}AED {Math.abs(dipAed)?.toLocaleString()}
            </span>
            {prevPrice && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">{formatPrice(prevPrice)}</span>
              </>
            )}
            {prevDate && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">{new Date(prevDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
              </>
            )}
          </div>
        )}

        {/* Dip 2 — Listing Change */}
        {listing_change != null && listing_change !== 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-600 text-[10px] w-[70px] shrink-0">Price Chg</span>
            <span className={listing_change < 0 ? 'text-red-400' : 'text-green-400'}>
              {listing_change < 0 ? '−' : '+'}AED {Math.abs(listing_change).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
