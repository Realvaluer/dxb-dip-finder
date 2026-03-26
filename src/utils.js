export function formatPrice(aed) {
  if (aed == null) return '—';
  if (Math.abs(aed) >= 1_000_000) return `AED ${(aed / 1_000_000).toFixed(2)}M`;
  if (Math.abs(aed) >= 1_000) return `AED ${(aed / 1_000).toFixed(0)}K`;
  return `AED ${aed.toLocaleString()}`;
}

export function formatPriceShort(aed) {
  if (aed == null) return '—';
  if (Math.abs(aed) >= 1_000_000) return `${(aed / 1_000_000).toFixed(2)}M`;
  if (Math.abs(aed) >= 1_000) return `${(aed / 1_000).toFixed(0)}K`;
  return aed.toLocaleString();
}

export function formatDate(dateStr, shortYear = false) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (shortYear) {
    const day = d.getDate();
    const mon = d.toLocaleDateString('en-GB', { month: 'short' });
    const yr = String(d.getFullYear()).slice(-2);
    return `${day} ${mon} '${yr}`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function sourceTag(source) {
  if (source === 'PropertyFinder' || source === 'Property Finder') return 'PF';
  if (source === 'Bayut') return 'Bayut';
  if (source === 'Dubizzle') return 'Dubizzle';
  return source;
}
