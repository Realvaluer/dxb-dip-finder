import { Link } from 'react-router-dom';
import DipBadge from '../ui/DipBadge';
import { formatPrice, formatFullDate, bedroomLabel } from '../../utils/formatters';

export default function ListingCard({ listing }) {
  const {
    id, property_name, location, bedrooms, size_sqft,
    current_price, source, date_listed, scraped_at, listing_type,
    // Signal 1 — vs Prior Listing
    change_pct, change_aed, previous_price, price_changed_at,
    // Signal 2 — Listing Change (same ref price change)
    listing_change,
    // Signal 3 — Last Sale/Rent (transaction data)
    last_sale_price, last_sale_date, last_sale_size, last_sale_type, last_sale_change,
    // Legacy field names (backward compat)
    dip_percent, dip_amount, last_txn_price, last_txn_date,
  } = listing;

  // Use new field names, fall back to legacy
  const dipPct = change_pct ?? dip_percent;
  const dipAed = change_aed ?? dip_amount;
  const prevPrice = previous_price;
  const prevDate = price_changed_at;

  // Signal 2 guard
  const hasListingChange = listing_change != null && listing_change !== 0;

  // Signal 3 guard — use new names, fall back to legacy
  const txnPrice = last_sale_price ?? last_txn_price;
  const txnDate = last_sale_date ?? last_txn_date;
  const txnSize = last_sale_size;
  const txnType = last_sale_type;
  const txnChange = last_sale_change ?? (txnPrice != null && current_price != null ? current_price - txnPrice : null);
  const hasLastSale = txnPrice != null && txnDate != null;
  const txnIsRent = txnType?.toLowerCase().includes('rent');
  const txnIsNeg = hasLastSale && txnChange != null && txnChange < 0;

  const sourceTag = source?.includes('Property') ? 'PF' : source === 'Bayut' ? 'BY' : source?.slice(0, 3)?.toUpperCase();
  const displayDate = formatFullDate(date_listed || scraped_at);
  const isSale = listing_type === 'Sale';

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <Link
      to={`/listing/${id}`}
      className="block bg-brand-900/40 rounded-xl p-4 active:bg-brand-900/60 transition-colors"
    >
      {/* Date + dip badges */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-gray-600">{displayDate}</span>
        <div className="flex gap-1.5 items-center">
          {hasListingChange && (
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
        {/* Signal 1 — vs Prior Listing */}
        {dipAed != null && dipAed !== 0 && prevPrice != null && (
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
                <span className="text-gray-500">{fmtDate(prevDate)}</span>
              </>
            )}
          </div>
        )}

        {/* Signal 2 — Listing Change (same listing price change) */}
        {hasListingChange && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-600 text-[10px] w-[70px] shrink-0">Price Chg</span>
            <span className={listing_change < 0 ? 'text-red-400' : 'text-green-400'}>
              {listing_change < 0 ? '−' : '+'}AED {Math.abs(listing_change).toLocaleString()}
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">was {formatPrice(current_price - listing_change)}</span>
          </div>
        )}

        {/* Signal 3 — Last Sale/Rent (transaction data) */}
        {hasLastSale && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-600 text-[10px] w-[70px] shrink-0">{txnIsRent ? 'Last Rent' : 'Last Sale'}</span>
            {txnChange != null && (
              <span className={txnIsNeg ? 'text-red-400' : 'text-green-400'}>
                {txnIsNeg ? '−' : '+'}AED {Math.abs(txnChange)?.toLocaleString()}
              </span>
            )}
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">{formatPrice(txnPrice)}</span>
            {txnSize != null && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">{Math.round(Number(txnSize)).toLocaleString()} sqft</span>
              </>
            )}
            <span className="text-gray-600">·</span>
            <span className="text-gray-500">{fmtDate(txnDate)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
