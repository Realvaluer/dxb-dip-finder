import { useNavigate } from 'react-router-dom';
import { formatDate, formatMonthYear, formatPrice, dipColor, sourceTag } from '../utils';

export default function ListingCard({ listing }) {
  const navigate = useNavigate();
  const l = listing;

  return (
    <button
      onClick={() => navigate(`/listing/${l.id}`)}
      className="w-full bg-card rounded-xl p-4 text-left active:opacity-80 transition-opacity"
    >
      {/* Row 1: date + dip pill */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-mono text-muted">{formatDate(l.date_listed)}</span>
        {l.dip_percent > 0 && (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${dipColor(l.dip_percent)}`}>
            -{l.dip_percent}%
          </span>
        )}
      </div>

      {/* Row 2: name + community */}
      <div className="font-semibold text-sm truncate">{l.property_name || l.community}</div>
      {l.property_name && (
        <div className="text-xs text-muted truncate">{l.community}</div>
      )}

      {/* Row 3: price + meta */}
      <div className="flex items-baseline justify-between mt-2">
        <span className="text-base font-bold">{formatPrice(l.price_aed)}</span>
      </div>

      {/* Row 4: beds · sqft · purpose · source */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className="text-xs text-muted">
          {l.bedrooms === 0 ? 'Studio' : `${l.bedrooms}BR`} · {l.size_sqft?.toLocaleString()} sqft
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${l.purpose === 'sale' ? 'bg-teal-900/50 text-teal-300' : 'bg-amber-900/50 text-amber-300'}`}>
          {l.purpose === 'sale' ? 'Sale' : 'Rent'}
        </span>
        <span className="ml-auto text-[10px] font-mono text-muted">{sourceTag(l.source)}</span>
      </div>

      {/* Row 5: dip footer */}
      {l.dip_percent > 0 && (
        <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted">
          <span className="text-dip-red font-medium">-{formatPrice(l.dip_amount)}</span>
          {' '}vs prev. {formatPrice(l.previous_price)} · {formatMonthYear(l.price_changed_at)}
        </div>
      )}
    </button>
  );
}
