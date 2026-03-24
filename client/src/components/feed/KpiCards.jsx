import { useNavigate, useSearchParams } from 'react-router-dom';
import useKpis from '../../hooks/useKpis';
import { formatPrice, formatPriceCompact } from '../../utils/formatters';

const SKELETON = (
  <div className="grid grid-cols-2 gap-2">
    {[0, 1, 2, 3].map(i => (
      <div key={i} className="bg-brand-900/40 rounded-xl p-3 animate-pulse h-20" />
    ))}
  </div>
);

export default function KpiCards() {
  const { kpis, loading } = useKpis();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  if (loading) return <div className="px-4">{SKELETON}</div>;
  if (!kpis) return null;

  const cards = [
    {
      label: 'Highest % dip',
      value: kpis.highest_pct_listing ? `${kpis.highest_pct_listing.dip_percent}%` : 'N/A',
      sub: kpis.highest_pct_listing ? `${kpis.highest_pct_listing.title?.slice(0, 30)}` : '',
      accent: 'border-l-red-500',
      onClick: () => kpis.highest_pct_listing && navigate(`/listing/${kpis.highest_pct_listing.listing_id}`),
    },
    {
      label: 'Highest value dip',
      value: kpis.highest_val_listing ? formatPrice(kpis.highest_val_listing.dip_amount) : 'N/A',
      sub: kpis.highest_val_listing ? `${kpis.highest_val_listing.title?.slice(0, 30)}` : '',
      accent: 'border-l-orange-500',
      onClick: () => kpis.highest_val_listing && navigate(`/listing/${kpis.highest_val_listing.listing_id}`),
    },
    {
      label: 'Most active area',
      value: kpis.hottest_area?.location || 'N/A',
      sub: kpis.hottest_area?.count ? `${kpis.hottest_area.count} dips this week` : '',
      accent: 'border-l-blue-500',
      onClick: () => kpis.hottest_area?.location && setSearchParams({ area: kpis.hottest_area.location }),
    },
    {
      label: 'New dips today',
      value: kpis.new_today_count?.toString() || '0',
      sub: 'listings in last 24h',
      accent: 'border-l-teal-500',
      onClick: () => setSearchParams({ sort: 'newest' }),
    },
  ];

  return (
    <div className="px-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">Today's snapshot</p>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card) => (
          <button
            key={card.label}
            onClick={card.onClick}
            className={`bg-brand-900/40 rounded-xl p-3 text-left border-l-[3px] ${card.accent} active:bg-brand-900/60 transition-colors`}
          >
            <p className="text-[10px] text-gray-500 mb-1">{card.label}</p>
            <p className="text-sm font-semibold text-gray-200 truncate">{card.value}</p>
            <p className="text-[10px] text-gray-500 truncate mt-0.5">{card.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
