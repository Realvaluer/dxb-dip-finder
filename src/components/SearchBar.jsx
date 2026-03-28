import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';

// Cache the property list globally so it persists across re-renders/navigations
let _fuseInstance = null;
let _loading = false;
let _loadPromise = null;

function loadFuse() {
  if (_fuseInstance) return Promise.resolve(_fuseInstance);
  if (_loadPromise) return _loadPromise;
  _loading = true;
  _loadPromise = fetch('/api/property-list')
    .then(r => r.json())
    .then(data => {
      _fuseInstance = new Fuse(data, {
        keys: ['property_name', 'community'],
        threshold: 0.35,
        includeScore: true,
        ignoreLocation: true,
      });
      _loading = false;
      return _fuseInstance;
    })
    .catch(() => { _loading = false; return null; });
  return _loadPromise;
}

export default function SearchBar({ value, onChange, onSelectCommunity, onSelectBuilding, activeFilters }) {
  const [local, setLocal] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [fuse, setFuse] = useState(_fuseInstance);
  const wrapRef = useRef(null);

  // Load Fuse.js on mount
  useEffect(() => {
    loadFuse().then(f => { if (f) setFuse(f); });
  }, []);

  useEffect(() => { setLocal(value); }, [value]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleChange(e) {
    const v = e.target.value;
    setLocal(v);
    if (!fuse || v.trim().length < 2) { setResults([]); setOpen(false); return; }

    // Instant client-side fuzzy search
    const hits = fuse.search(v.trim()).slice(0, 30).map(r => r.item);

    // Group into communities and buildings
    const commMap = {};
    const bldgMap = {};
    for (const h of hits) {
      if (h.community && h.community.toLowerCase().includes(v.trim().toLowerCase())) {
        if (!commMap[h.community]) commMap[h.community] = 0;
        commMap[h.community] += h.count;
      }
      if (h.property_name) {
        const key = `${h.property_name}|${h.community}`;
        if (!bldgMap[key]) bldgMap[key] = { label: h.property_name, community: h.community, cnt: 0 };
        bldgMap[key].cnt += h.count;
      }
    }

    const communities = Object.entries(commMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, cnt]) => ({ label, cnt }));

    const buildings = Object.values(bldgMap)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 15);

    setResults({ communities, buildings });
    setOpen(true);
  }

  function selectCommunity(label) {
    setLocal('');
    setSuggestionsOpen(true); // keep dropdown open for more selections
    onSelectCommunity(label);
  }

  function selectBuilding(label) {
    setLocal('');
    // Keep dropdown open
    onSelectBuilding(label);
  }

  function setSuggestionsOpen(val) {
    setOpen(val);
  }

  const hasSuggestions = results && (results.communities?.length > 0 || results.buildings?.length > 0);

  return (
    <div className="px-4 py-2" ref={wrapRef}>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={local}
          onChange={handleChange}
          onFocus={() => { if (hasSuggestions) setOpen(true); }}
          placeholder="Search building or community..."
          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-muted outline-none focus:border-accent/50 transition min-h-[44px]"
        />
        {local && (
          <button
            onClick={() => { setLocal(''); onChange(''); setResults([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown */}
        {open && results && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-[260px] overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
            {results.communities?.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-medium">Communities</div>
                {results.communities.map(s => (
                  <button key={s.label} onMouseDown={() => selectCommunity(s.label)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[44px] flex items-center justify-between">
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted text-[10px] ml-2">{s.cnt}</span>
                  </button>
                ))}
              </>
            )}
            {results.buildings?.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-medium border-t border-border">Buildings</div>
                {results.buildings.map(s => (
                  <button key={`${s.label}|${s.community}`} onMouseDown={() => selectBuilding(s.label)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[44px] flex flex-col">
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted text-[10px]">{s.community} · {s.cnt} listings</span>
                  </button>
                ))}
              </>
            )}
            {!hasSuggestions && local.length >= 2 && (
              <div className="px-3 py-4 text-xs text-muted text-center">No results for "{local}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
