import { useState, useEffect, useMemo } from 'react';

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

function MultiSelectSearch({ label, options, selected, onChange, placeholder }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return options.slice(0, 100);
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 100);
  }, [options, search]);

  function toggle(val) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val));
    } else {
      onChange([...selected, val]);
    }
  }

  return (
    <div>
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">{label}</div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(s => (
            <span key={s} className="bg-accent/20 text-accent text-[11px] px-2 py-1 rounded-full flex items-center gap-1">
              {s}
              <button onClick={() => toggle(s)} className="ml-0.5">x</button>
            </span>
          ))}
          <button onClick={() => onChange([])} className="text-[11px] text-dip-red ml-1">Clear all</button>
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-white placeholder-muted outline-none focus:border-accent/50 mb-2"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {filtered.map(opt => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-card/50 min-h-[36px]"
          >
            <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
              selected.includes(opt) ? 'bg-accent border-accent' : 'border-border'
            }`}>
              {selected.includes(opt) && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="text-white truncate">{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FilterSheet({ open, onClose, filters, setFilter, resetFilters, resultCount, filterOptions }) {
  const [localFilters, setLocalFilters] = useState({});

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
    Object.entries(localFilters).forEach(([k, v]) => setFilter(k, v));
    onClose();
  }

  function reset() {
    resetFilters();
    onClose();
  }

  if (!open) return null;

  const opts = filterOptions || { communities: [], property_names: [], types: [], sources: [] };
  const minDip = parseFloat(localFilters.min_dip || 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 sheet-overlay" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-bg rounded-t-2xl max-h-[85vh] flex flex-col sheet-content">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
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
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-white outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted">To</label>
                <input type="date" value={localFilters.date_to || ''}
                  onChange={e => setLocal('date_to', e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-white outline-none" />
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

          {/* Community */}
          <MultiSelectSearch
            label="Community"
            options={opts.communities}
            selected={localFilters.communities || []}
            onChange={v => setLocal('communities', v)}
            placeholder="Search community..."
          />

          {/* Building */}
          <MultiSelectSearch
            label="Building"
            options={opts.property_names}
            selected={localFilters.buildings || []}
            onChange={v => setLocal('buildings', v)}
            placeholder="Search building..."
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
        <div className="border-t border-border px-4 py-3 flex items-center justify-between">
          <button onClick={reset} className="text-sm text-muted min-h-[44px]">Reset all</button>
          <button onClick={apply} className="bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-semibold min-h-[44px]">
            Show {resultCount != null ? resultCount.toLocaleString() : '...'} results
          </button>
        </div>
      </div>
    </>
  );
}
