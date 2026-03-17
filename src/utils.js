export function formatPrice(aed) {
  if (aed == null) return '—';
  if (aed >= 1_000_000) return `AED ${(aed / 1_000_000).toFixed(2)}M`;
  if (aed >= 1_000) return `AED ${(aed / 1_000).toFixed(0)}K`;
  return `AED ${aed.toLocaleString()}`;
}

export function formatPriceShort(aed) {
  if (aed == null) return '—';
  if (aed >= 1_000_000) return `${(aed / 1_000_000).toFixed(2)}M`;
  if (aed >= 1_000) return `${(aed / 1_000).toFixed(0)}K`;
  return aed.toLocaleString();
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function dipColor(pct) {
  if (pct >= 30) return 'bg-dip-red';
  if (pct >= 15) return 'bg-dip-orange';
  if (pct >= 5) return 'bg-dip-amber';
  return 'bg-gray-500';
}

export function dipTextColor(pct) {
  if (pct >= 30) return 'text-dip-red';
  if (pct >= 15) return 'text-dip-orange';
  if (pct >= 5) return 'text-dip-amber';
  return 'text-gray-400';
}

export function sourceTag(source) {
  if (source === 'PropertyFinder' || source === 'Property Finder') return 'PF';
  if (source === 'Bayut') return 'Bayut';
  if (source === 'Dubizzle') return 'Dubizzle';
  return source;
}
