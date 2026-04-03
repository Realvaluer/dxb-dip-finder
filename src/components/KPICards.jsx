import { useNavigate } from 'react-router-dom';

const CARDS = [
  { key: 'total_listings', accent: 'bg-blue-500', label: 'Total Listings' },
  { key: 'highest_dip_pct', accent: 'bg-dip-red', label: 'Highest % drop in 24h' },
  { key: 'sales_drops', accent: 'bg-teal-500', label: 'Sales Drops' },
  { key: 'rental_drops', accent: 'bg-amber-500', label: 'Rental Drops' },
];

export default function KPICards({ data, loading }) {
  const navigate = useNavigate();

  function cardValue(card) {
    if (loading || !data) return null;
    if (card.key === 'total_listings') return (data.total_listings ?? 0).toLocaleString();
    if (card.key === 'highest_dip_pct') {
      const d = data.highest_dip_pct;
      return d ? `${d.change_pct}%` : '—';
    }
    if (card.key === 'sales_drops') return (data.sales_drops ?? 0).toLocaleString();
    if (card.key === 'rental_drops') return (data.rental_drops ?? 0).toLocaleString();
    return '—';
  }

  function cardSubtitle(card) {
    if (!data) return '';
    if (card.key === 'total_listings') return 'Active listings';
    if (card.key === 'highest_dip_pct') {
      const d = data.highest_dip_pct;
      return d ? `${d.property_name || ''} · ${d.community || ''}` : 'No drops found';
    }
    if (card.key === 'sales_drops') return 'Below last transaction';
    if (card.key === 'rental_drops') return 'Below last transaction';
    return '';
  }

  function handleClick(card) {
    if (!data) return;
    if (card.key === 'highest_dip_pct' && data.highest_dip_pct?.listing_id) {
      navigate(`/listing/${data.highest_dip_pct.listing_id}`);
    }
  }

  return (
    <div className="px-4 py-2 grid grid-cols-2 gap-2.5">
      {CARDS.map(card => (
        <button
          key={card.key}
          onClick={() => handleClick(card)}
          className="bg-card rounded-xl p-3 text-left flex gap-2.5 min-h-[44px] active:opacity-80 transition-opacity"
        >
          <div className={`w-1 rounded-full ${card.accent} flex-shrink-0`} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{card.label}</div>
            {loading ? (
              <div className="skeleton h-6 w-20 mb-1" />
            ) : (
              <div className="text-base font-bold truncate">{cardValue(card)}</div>
            )}
            {loading ? (
              <div className="skeleton h-3 w-24 mt-1" />
            ) : (
              <div className="text-[10px] text-muted truncate">{cardSubtitle(card)}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
