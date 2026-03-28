import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';

// Global cache
let _propertyList = null;
let _fuseInstance = null;
let _loadPromise = null;

function loadPropertyList() {
  if (_propertyList) return Promise.resolve(_propertyList);
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch('/api/property-list')
    .then(r => r.json())
    .then(data => {
      _propertyList = data;
      _fuseInstance = new Fuse(data, {
        keys: ['property_name', 'community'],
        threshold: 0.35,
        includeScore: true,
        ignoreLocation: true,
      });
      return data;
    })
    .catch(() => null);
  return _loadPromise;
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// FIX 2-4: Exact substring → numeric token filter → fuzzy fallback → sort by listing_count
function searchProperties(query) {
  if (!_propertyList || !query || query.trim().length < 2) return { communities: [], buildings: [] };

  const q = query.trim().toLowerCase();

  // Step 1: exact substring match on property_name and community
  let exactMatches = _propertyList.filter(p =>
    (p.property_name || '').toLowerCase().includes(q) ||
    (p.community || '').toLowerCase().includes(q)
  );

  // Step 2: if query contains numbers, require those numbers in results
  const numericTokens = query.match(/\d+/g);
  if (numericTokens) {
    exactMatches = exactMatches.filter(p =>
      numericTokens.every(n =>
        (p.property_name || '').includes(n) ||
        (p.community || '').includes(n)
      )
    );
  }

  // Also filter by all word tokens for multi-word queries like "residence 110"
  const wordTokens = q.split(/\s+/).filter(t => t.length > 0);
  if (wordTokens.length > 1) {
    exactMatches = exactMatches.filter(p => {
      const combined = ((p.property_name || '') + ' ' + (p.community || '')).toLowerCase();
      return wordTokens.every(t => combined.includes(t));
    });
  }

  // Step 3: fuzzy ONLY if query >= 5 chars AND exact < 3 results
  let fuzzyResults = [];
  if (q.length >= 5 && exactMatches.length < 3 && _fuseInstance) {
    const fuzzyHits = _fuseInstance.search(q).slice(0, 20).map(r => r.item);
    const exactIds = new Set(exactMatches.map(p => `${p.property_name}|${p.community}`));
    fuzzyResults = fuzzyHits.filter(p => !exactIds.has(`${p.property_name}|${p.community}`));
  }

  // Combine: exact first (sorted by listing_count), then fuzzy
  const combined = [...exactMatches, ...fuzzyResults];

  // Sort by listing_count descending
  combined.sort((a, b) => (b.listing_count || b.count || 0) - (a.listing_count || a.count || 0));

  // Group into communities and buildings
  const commMap = {};
  const bldgMap = {};
  for (const h of combined.slice(0, 40)) {
    // Community match: only if the query matches the community name
    if (h.community && h.community.toLowerCase().includes(q)) {
      if (!commMap[h.community]) commMap[h.community] = 0;
      commMap[h.community] += (h.listing_count || h.count || 1);
    }
    if (h.property_name) {
      const key = `${h.property_name}|${h.community}`;
      if (!bldgMap[key]) bldgMap[key] = { label: h.property_name, community: h.community || '', cnt: h.listing_count || h.count || 1 };
    }
  }

  return {
    communities: Object.entries(commMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, cnt]) => ({ label, cnt })),
    buildings: Object.values(bldgMap).sort((a, b) => b.cnt - a.cnt).slice(0, 15),
  };
}

export default function SearchBar({ value, onChange, onSelectCommunity, onSelectBuilding }) {
  const [local, setLocal] = useState('');
  const [results, setResults] = useState({ communities: [], buildings: [] });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(!!_propertyList);
  const wrapRef = useRef(null);

  const debouncedQuery = useDebounce(local, 200);

  useEffect(() => {
    loadPropertyList().then(d => { if (d) setLoaded(true); });
  }, []);

  useEffect(() => { setLocal(value); }, [value]);

  // Close on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Run search on debounced query
  useEffect(() => {
    if (!loaded || debouncedQuery.trim().length < 2) {
      setResults({ communities: [], buildings: [] });
      if (debouncedQuery.trim().length < 2) setOpen(false);
      return;
    }
    const r = searchProperties(debouncedQuery);
    setResults(r);
    setOpen(true);
  }, [debouncedQuery, loaded]);

  function selectCommunity(label) {
    setLocal('');
    onSelectCommunity(label);
  }

  function selectBuilding(label) {
    setLocal('');
    onSelectBuilding(label);
  }

  const hasSuggestions = results.communities.length > 0 || results.buildings.length > 0;

  return (
    <div className="px-4 py-2" ref={wrapRef}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onFocus={() => { if (hasSuggestions) setOpen(true); }}
          placeholder="Search building or community..."
          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-muted outline-none focus:border-accent/50 transition min-h-[44px]"
        />
        {local && (
          <button
            onClick={() => { setLocal(''); onChange(''); setResults({ communities: [], buildings: [] }); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {open && (hasSuggestions || local.length >= 2) && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-[260px] overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
            {results.communities.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-medium">Communities</div>
                {results.communities.map(s => (
                  <button key={s.label} onMouseDown={() => selectCommunity(s.label)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[44px] flex items-center justify-between">
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted text-[10px] ml-2">{s.cnt.toLocaleString()}</span>
                  </button>
                ))}
              </>
            )}
            {results.buildings.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-medium border-t border-border">Buildings</div>
                {results.buildings.map(s => (
                  <button key={`${s.label}|${s.community}`} onMouseDown={() => selectBuilding(s.label)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[44px] flex flex-col">
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted text-[10px]">{s.community} · {s.cnt.toLocaleString()} listings</span>
                  </button>
                ))}
              </>
            )}
            {!hasSuggestions && local.length >= 2 && (
              <div className="px-3 py-4 text-xs text-muted text-center">No results for &ldquo;{local}&rdquo;</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
