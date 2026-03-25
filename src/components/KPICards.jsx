import { useNavigate } from 'react-router-dom';
import { formatPriceShort } from '../utils';

const CARDS = [
  { key: 'highest_dip_pct', accent: 'bg-dip-red', label: 'Highest % drop today' },
  { key: 'highest_dip_aed', accent: 'bg-dip-orange', label: 'Highest AED drop today' },
  { key: 'most_drops_community', accent: 'bg-blue-500', label: 'Community with most drops' },
  { key: 'dips_today', accent: 'bg-teal-500', label: 'Dips in last 24h' },
];

export default function KPICards({ data, loading, onCommunityClick }) {
  const navigate = useNavigate();

  function cardValue(card) {
    if (loading || !data) return null;
    const d = data[card.key];
    if (card.key === 'highest_dip_pct') return d ? `${d.change_pct}%` : '—';
    if (card.key === 'highest_dip_aed') return d ? `−AED ${formatPriceShort(Math.abs(d.change_aed))}` : '—';
    if (card.key === 'most_drops_community') return d?.community || '—';
    if (card.key === 'dips_today') return data.dips_today ?? 0;
    return '—';
  }

  function cardSubtitle(card) {
    if (!data) return '';
    const d = data[card.key];
    if (card.key === 'highest_dip_pct' && d) return `${d.property_name || ''} · ${d.community || ''}`;
    if (card.key === 'highest_dip_aed' && d) return `${d.property_name || ''} · ${d.community || ''}`;
    if (card.key === 'most_drops_community' && d) return `${d.count} listings with drops`;
    if (card.key === 'dips_today') return 'Price drops today';
    return '';
  }

  function handleClick(card) {
    if (!data) return;
    const d = data[card.key];
    if (card.key === 'highest_dip_pct' && d?.listing_id) navigate(`/listing/${d.listing_id}`);
    if (card.key === 'highest_dip_aed' && d?.listing_id) navigate(`/listing/${d.listing_id}`);
    if (card.key === 'most_drops_community' && d?.community) onCommunityClick(d.community);
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
