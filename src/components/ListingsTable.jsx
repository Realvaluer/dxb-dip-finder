import { useNavigate } from 'react-router-dom';
import { formatPrice, formatDate, sourceTag } from '../utils';

const COLUMNS = [
  { key: 'listed_date', label: 'Date', width: '100px', sort: 'newest' },
  { key: 'source', label: 'Source', width: '80px' },
  { key: 'purpose', label: 'Purpose', width: '70px' },
  { key: 'community', label: 'Community', width: '160px' },
  { key: 'property_name', label: 'Building', width: '180px' },
  { key: 'type', label: 'Type', width: '90px' },
  { key: 'bedrooms', label: 'Beds', width: '55px', align: 'right' },
  { key: 'size_sqft', label: 'Size', width: '85px', align: 'right' },
  { key: 'price_aed', label: 'Price (AED)', width: '120px', align: 'right', sort: 'price' },
  { key: 'change_pct', label: 'Change %', width: '90px', align: 'right', sort: 'dip_pct' },
  { key: 'change_aed', label: 'Change AED', width: '110px', align: 'right', sort: 'dip_aed' },
  { key: 'listing_change', label: 'Listing Change', width: '120px', align: 'right', sort: 'listing_change' },
];

function getSortValue(col, currentSort) {
  if (!col.sort) return null;
  if (col.sort === 'newest') return currentSort === 'newest' ? 'newest' : null;
  if (col.sort === 'price') return currentSort === 'price_asc' || currentSort === 'price_desc' ? currentSort : null;
  if (col.sort === 'dip_pct') return currentSort === 'dip_pct' ? 'dip_pct' : null;
  if (col.sort === 'dip_aed') return currentSort === 'dip_aed' ? 'dip_aed' : null;
  if (col.sort === 'listing_change') return currentSort === 'listing_change' ? 'listing_change' : null;
  return null;
}

function getSortArrow(col, currentSort) {
  const val = getSortValue(col, currentSort);
  if (!val) return '';
  if (val === 'newest') return ' ▼';
  if (val === 'price_asc') return ' ▲';
  if (val === 'price_desc') return ' ▼';
  if (val === 'dip_pct' || val === 'dip_aed' || val === 'listing_change') return ' ▲';
  return '';
}

function nextSort(col, currentSort) {
  if (!col.sort) return currentSort;
  if (col.sort === 'newest') return 'newest';
  if (col.sort === 'price') {
    if (currentSort === 'price_asc') return 'price_desc';
    return 'price_asc';
  }
  if (col.sort === 'dip_pct') return 'dip_pct';
  if (col.sort === 'dip_aed') return 'dip_aed';
  if (col.sort === 'listing_change') return 'listing_change';
  return currentSort;
}

function formatCell(col, listing) {
  const val = listing[col.key];
  switch (col.key) {
    case 'listed_date': return formatDate(val);
    case 'source': return sourceTag(val);
    case 'purpose': return val ? val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() : '';
    case 'bedrooms': return val == null || val === 0 || val === 'Studio' || val === 'studio' ? 'Studio' : val;
    case 'size_sqft': return val ? Number(val).toLocaleString() : '—';
    case 'price_aed': return val ? `AED ${Number(val).toLocaleString()}` : '—';
    case 'change_pct': {
      const pct = listing.last_sale_change_pct ?? val;
      if (pct == null) return '—';
      return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
    case 'change_aed': {
      const aed = listing.last_sale_change ?? val;
      if (aed == null) return '—';
      return `${aed > 0 ? '+' : ''}AED ${Math.abs(aed).toLocaleString()}`;
    }
    case 'listing_change':
      if (val == null) return '—';
      return `${val > 0 ? '+' : '-'}AED ${Math.abs(val).toLocaleString()}`;
    default: return val || '—';
  }
}

function cellColor(col, listing) {
  if (col.key === 'change_pct' || col.key === 'change_aed' || col.key === 'listing_change') {
    let val = listing[col.key];
    if (col.key === 'change_pct') val = listing.last_sale_change_pct ?? val;
    if (col.key === 'change_aed') val = listing.last_sale_change ?? val;
    if (val == null) return '';
    if (val < 0) return 'text-dip-red';
    if (val > 0) return 'text-green-400';
  }
  return '';
}

export default function ListingsTable({ listings, sort, onSortChange, bookmarkedIds, onToggleBookmark }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-card border-b border-border">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                className={`px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap ${
                  col.sort ? 'cursor-pointer hover:text-white select-none' : ''
                } ${col.align === 'right' ? 'text-right' : ''}`}
                style={{ width: col.width, minWidth: col.width }}
                onClick={() => col.sort && onSortChange(nextSort(col, sort))}
              >
                {col.label}
                {col.sort && (
                  <span className="text-accent">{getSortArrow(col, sort)}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {listings.map((listing, i) => (
            <tr
              key={listing.id}
              onClick={() => navigate(`/listing/${listing.id}`)}
              className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-[#1a3a3a] ${
                i % 2 === 0 ? 'bg-bg' : 'bg-card/50'
              }`}
            >
              {COLUMNS.map(col => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis ${
                    col.align === 'right' ? 'text-right tabular-nums' : ''
                  } ${col.key === 'price_aed' ? 'font-semibold' : ''} ${cellColor(col, listing)}`}
                  style={{ maxWidth: col.width }}
                  title={listing[col.key]?.toString() || ''}
                >
                  {formatCell(col, listing)}
                </td>
              ))}
            </tr>
          ))}
          {listings.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-muted">
                No listings found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
