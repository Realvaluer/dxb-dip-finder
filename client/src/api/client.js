const BASE = '/api';

export async function fetchListings(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      // Send arrays as comma-separated
      if (v.length > 0) qs.set(k, v.join(','));
    } else {
      qs.set(k, v);
    }
  }
  const res = await fetch(`${BASE}/listings?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch listings');
  return res.json();
}

export async function fetchListing(id) {
  const res = await fetch(`${BASE}/listings/${id}`);
  if (!res.ok) throw new Error('Failed to fetch listing');
  return res.json();
}

export async function fetchKpis(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length > 0) qs.set(k, v.join(','));
    } else {
      qs.set(k, v);
    }
  }
  const res = await fetch(`${BASE}/kpis?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch KPIs');
  return res.json();
}

export async function fetchAreas() {
  const res = await fetch(`${BASE}/areas`);
  if (!res.ok) throw new Error('Failed to fetch areas');
  return res.json();
}

export async function fetchBuildings(communities = []) {
  const qs = new URLSearchParams();
  if (communities.length > 0) qs.set('communities', communities.join(','));
  const res = await fetch(`${BASE}/filter-options/buildings?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch buildings');
  return res.json();
}
