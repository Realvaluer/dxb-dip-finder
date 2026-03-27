import { useState, useEffect, useRef, useCallback } from 'react';
import { trackFilter } from '../lib/analytics';

function Pill({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition min-h-[36px] whitespace-nowrap ${
        selected ? 'bg-accent text-white' : 'bg-card text-muted border border-border'
      }`}
    >
      {label}
    </button>
  );
}

function SearchChipSelect({ label, placeholder, selected, onChange, fetchUrl }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const timerRef = useRef(null);

  function handleSearch(v) {
    setSearch(v);
    clearTimeout(timerRef.current);
    if (v.length < 2) { setResults([]); return; }
    timerRef.current = setTimeout(() => {
      fetch(`${fetchUrl}?q=${encodeURIComponent(v)}`)
        .then(r => r.json())
        .then(d => setResults(d))
        .catch(() => {});
    }, 200);
  }

  function add(val) {
    if (!selected.includes(val)) onChange([...selected, val]);
    setSearch('');
    setResults([]);
  }

  function remove(val) {
    onChange(selected.filter(v => v !== val));
  }

  return (
    <div className="overflow-hidden">
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">{label}</div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(s => (
            <span key={s} className="bg-accent/20 text-accent text-[11px] px-2 py-1 rounded-full flex items-center gap-1 max-w-full">
              <span className="truncate">{s}</span>
              <button onClick={() => remove(s)} className="ml-0.5 font-bold flex-shrink-0">x</button>
            </span>
          ))}
          <button onClick={() => onChange([])} className="text-[11px] text-dip-red ml-1">Clear</button>
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-white placeholder-muted outline-none focus:border-accent/50"
        />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
            {results.map(r => (
              <button key={r.label} onClick={() => add(r.label)}
                className="w-full text-left px-3 py-2 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[36px] flex items-center justify-between">
                <span className="truncate">{r.label}</span>
                <span className="text-muted text-[10px] ml-2 flex-shrink-0">{r.cnt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Build URL params from local filter state
function buildFilterParams(localFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(localFilters)) {
    if (key === 'communities') {
      (value || []).forEach(v => params.append('community[]', v));
    } else if (key === 'buildings') {
      (value || []).forEach(v => params.append('property_name[]', v));
    } else if (key === 'sort' && value && value !== 'newest') {
      params.set(key, value);
    } else if (key !== 'sort' && value) {
      params.set(key, value);
    }
  }
  return params;
}

export default function FilterSheet({ open, onClose, filters, filterOptions }) {
  const [localFilters, setLocalFilters] = useState({});
  const [liveCount, setLiveCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const sheetRef = useRef(null);
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false });
  const countTimerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setLocalFilters({
        sort: filters.sort,
        purpose: filters.purpose,
        bedrooms: filters.bedrooms,
        communities: [...filters.communities],
        buildings: [...filters.buildings],
        type: filters.type,
        source: filters.source,
        date_from: filters.date_from,
        date_to: filters.date_to,
      });
      setLiveCount(null);
    }
  }, [open]);

  // Fetch live count whenever local filters change
  useEffect(() => {
    if (!open) return;
    clearTimeout(countTimerRef.current);
    setCountLoading(true);
    countTimerRef.current = setTimeout(() => {
      const params = buildFilterParams(localFilters);
      fetch(`/api/listings/count?${params.toString()}`)
        .then(r => r.json())
        .then(d => { setLiveCount(d.total); setCountLoading(false); })
        .catch(() => setCountLoading(false));
    }, 300);
    return () => clearTimeout(countTimerRef.current);
  }, [localFilters, open]);

  function setLocal(key, val) {
    setLocalFilters(prev => ({ ...prev, [key]: val }));
  }

  function apply() {
    trackFilter(localFilters);
    const params = buildFilterParams(localFilters);
    window.location.href = '/?' + params.toString();
  }

  function reset() {
    window.location.href = '/';
  }

  // Swipe to close — works from anywhere on the sheet
  const handleTouchStart = useCallback((e) => {
    dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, dragging: true };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const touchY = e.touches[0].clientY;
    dragRef.current.currentY = touchY;
    const delta = touchY - dragRef.current.startY;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.dragging) return;
    const delta = dragRef.current.currentY - dragRef.current.startY;
    dragRef.current.dragging = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s ease';
      sheetRef.current.style.transform = '';
    }
    if (delta > 80) {
      onClose();
    }
  }, [onClose]);

  // Handle bar specific touch (doesn't interfere with scrolling)
  const handleHandleTouchStart = useCallback((e) => {
    dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, dragging: true };
  }, []);

  if (!open) return null;

  const opts = filterOptions || { communities: [], property_names: [], types: [], sources: [] };
  const countDisplay = countLoading ? '—' : (liveCount != null ? liveCount.toLocaleString() : '...');

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 bg-bg rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{ maxWidth: '100vw' }}
      >
        {/* Handle — drag target */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-grab touch-none"
          onTouchStart={handleHandleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="overflow-y-auto overflow-x-hidden flex-1 px-4 pb-4 space-y-5" style={{ overscrollBehavior: 'contain' }}>
          {/* Date listed */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Date listed</div>
            <div className="flex gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] text-muted">From</label>
                <input type="date" value={localFilters.date_from || ''}
                  onChange={e => setLocal('date_from', e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-white outline-none" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-[10px] text-muted">To</label>
                <input type="date" value={localFilters.date_to || ''}
                  onChange={e => setLocal('date_to', e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-white outline-none" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Today', fn: () => { const t = new Date().toISOString().slice(0,10); setLocal('date_from', t); setLocal('date_to', t); }},
                { label: 'Last 7 days', fn: () => { const t = new Date(); const f = new Date(t - 7*86400000); setLocal('date_from', f.toISOString().slice(0,10)); setLocal('date_to', t.toISOString().slice(0,10)); }},
                { label: 'Last 30 days', fn: () => { const t = new Date(); const f = new Date(t - 30*86400000); setLocal('date_from', f.toISOString().slice(0,10)); setLocal('date_to', t.toISOString().slice(0,10)); }},
                { label: 'All time', fn: () => { setLocal('date_from', ''); setLocal('date_to', ''); }},
              ].map(preset => (
                <Pill key={preset.label} label={preset.label} selected={false} onClick={preset.fn} />
              ))}
            </div>
          </div>

          {/* Bedrooms */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Bedrooms</div>
            <div className="flex flex-wrap gap-2">
              {[['','Any'],['0','Studio'],['1','1'],['2','2'],['3','3'],['4','4+']].map(([v,l]) => (
                <Pill key={v} label={l} selected={localFilters.bedrooms === v} onClick={() => setLocal('bedrooms', v)} />
              ))}
            </div>
          </div>

          {/* Community */}
          <SearchChipSelect
            label="Community"
            placeholder="Search community..."
            selected={localFilters.communities || []}
            onChange={v => setLocal('communities', v)}
            fetchUrl="/api/search-community"
          />

          {/* Building */}
          <SearchChipSelect
            label="Building"
            placeholder="Search building..."
            selected={localFilters.buildings || []}
            onChange={v => setLocal('buildings', v)}
            fetchUrl="/api/search-building"
          />

          {/* Property type */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Property type</div>
            <div className="flex flex-wrap gap-2">
              <Pill label="Any" selected={!localFilters.type} onClick={() => setLocal('type', '')} />
              {opts.types.map(t => (
                <Pill key={t} label={t} selected={localFilters.type === t} onClick={() => setLocal('type', t)} />
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Source</div>
            <div className="flex flex-wrap gap-2">
              <Pill label="All" selected={!localFilters.source} onClick={() => setLocal('source', '')} />
              {opts.sources.map(s => (
                <Pill key={s} label={s} selected={localFilters.source === s} onClick={() => setLocal('source', s)} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3 flex items-center justify-between pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button onClick={reset} className="text-sm text-muted min-h-[44px]">Reset all</button>
          <button onClick={apply} className={`bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${countLoading ? 'animate-pulse' : ''}`}>
            Show {countDisplay} results
          </button>
        </div>
      </div>
    </>
  );
}
