export function formatPrice(aed) {
  if (!aed) return 'N/A';
  if (aed >= 1_000_000) return `AED ${(aed / 1_000_000).toFixed(2)}M`;
  if (aed >= 1_000) return `AED ${(aed / 1_000).toFixed(0)}K`;
  return `AED ${aed.toLocaleString()}`;
}

export function formatPriceCompact(aed) {
  if (!aed) return 'N/A';
  if (aed >= 1_000_000) return `${(aed / 1_000_000).toFixed(1)}M`;
  if (aed >= 1_000) return `${(aed / 1_000).toFixed(0)}K`;
  return aed.toLocaleString();
}

export function formatDipPercent(pct) {
  if (pct === null || pct === undefined) return 'N/A';
  return `${pct > 0 ? '-' : '+'}${Math.abs(pct).toFixed(1)}%`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
}

export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  });
}

export function formatFullDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function getDipColor(pct) {
  if (pct >= 20) return { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' };
  if (pct >= 10) return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' };
  if (pct >= 5) return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' };
  return { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' };
}

export function bedroomLabel(beds) {
  if (beds === 0) return 'Studio';
  return `${beds} BR`;
}
