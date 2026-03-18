import { useState, useEffect, useRef, useCallback } from 'react';

function Pill({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition min-h-[36px] ${
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
    <div>
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">{label}</div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(s => (
            <span key={s} className="bg-accent/20 text-accent text-[11px] px-2 py-1 rounded-full flex items-center gap-1">
              {s}
              <button onClick={() => remove(s)} className="ml-0.5 font-bold">x</button>
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
                <span className="text-muted text-[10px] ml-2">{r.cnt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FilterSheet({ open, onClose, filters, setFilter, setFilters, resetFilters, resultCount, filterOptions }) {
  const [localFilters, setLocalFilters] = useState({});
  const sheetRef = useRef(null);
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false });

  useEffect(() => {
    if (open) {
      setLocalFilters({
        sort: filters.sort,
        purpose: filters.purpose,
        min_dip: filters.min_dip,
        bedrooms: filters.bedrooms,
        communities: [...filters.communities],
        buildings: [...filters.buildings],
        type: filters.type,
        source: filters.source,
        date_from: filters.date_from,
        date_to: filters.date_to,
      });
    }
  }, [open]);

  function setLocal(key, val) {
    setLocalFilters(prev => ({ ...prev, [key]: val }));
  }

  function apply() {
    // Use setFilters (batch) to avoid race condition
    if (setFilters) {
      setFilters(localFilters);
    } else {
      Object.entries(localFilters).forEach(([k, v]) => setFilter(k, v));
    }
    onClose();
  }

  function reset() {
    resetFilters();
    onClose();
  }

  // Swipe to close
  const handleTouchStart = useCallback((e) => {
    const el = sheetRef.current;
    if (!el) return;
    // Only allow swipe from the handle area (top 40px)
    const rect = el.getBoundingClientRect();
    const touchY = e.touches[0].clientY;
    if (touchY - rect.top > 50) return;
    dragRef.current = { startY: touchY, currentY: touchY, dragging: true };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const touchY = e.touches[0].clientY;
    dragRef.current.currentY = touchY;
    const delta = touchY - dragRef.current.startY;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.dragging) return;
    const delta = dragRef.current.currentY - dragRef.current.startY;
    dragRef.current.dragging = false;
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    if (delta > 100) {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  const opts = filterOptions || { communities: [], property_names: [], types: [], sources: [] };
  const minDip = parseFloat(localFilters.min_dip || 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 sheet-overlay" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 bg-bg rounded-t-2xl max-h-[85vh] flex flex-col sheet-content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle — swipe target */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-5">
          {/* Date listed */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Date listed</div>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted">From</label>
                <input type="date" value={localFilters.date_from || ''}
                  onChange={e => setLocal('date_from', e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-white outline-none" />
              </div>
              <div className="flex-1">
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

          {/* Sort */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Sort by</div>
            <div className="flex flex-wrap gap-2">
              {[['dip_pct','Biggest dip %'],['dip_aed','Biggest dip AED'],['newest','Most recent'],['price_asc','Price ↑'],['price_desc','Price ↓']].map(([v,l]) => (
                <Pill key={v} label={l} selected={localFilters.sort === v} onClick={() => setLocal('sort', v)} />
              ))}
            </div>
          </div>

          {/* Purpose */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Purpose</div>
            <div className="flex flex-wrap gap-2">
              {[['','Both'],['sale','Sale'],['rent','Rent']].map(([v,l]) => (
                <Pill key={v} label={l} selected={localFilters.purpose === v} onClick={() => setLocal('purpose', v)} />
              ))}
            </div>
          </div>

          {/* Min dip */}
          <div>
            <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Min dip %: {minDip}%</div>
            <input
              type="range"
              min={0} max={50} step={1}
              value={minDip}
              onChange={e => setLocal('min_dip', e.target.value)}
              className="w-full accent-accent"
            />
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

          {/* Community — search + chips only */}
          <SearchChipSelect
            label="Community"
            placeholder="Search community..."
            selected={localFilters.communities || []}
            onChange={v => setLocal('communities', v)}
            fetchUrl="/api/search-community"
          />

          {/* Building — search + chips only */}
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
          <button onClick={apply} className="bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-semibold min-h-[44px]">
            Show {resultCount != null ? resultCount.toLocaleString() : '...'} results
          </button>
        </div>
      </div>
    </>
  );
}
