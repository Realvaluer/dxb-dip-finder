import { useState, useRef, useEffect } from 'react';

/* ─── Multi-select dropdown with search (Community / Building) ─── */
function MultiSelectDropdown({ label, selected, onChange, fetchUrl, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const ref = useRef(null);
  const timerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const triggerLabel = selected.length === 0
    ? label
    : selected.length <= 2
      ? selected.join(', ')
      : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border transition-colors min-w-[120px] max-w-[200px] truncate ${
          selected.length > 0
            ? 'bg-accent/20 border-accent/40 text-accent'
            : 'bg-card border-border text-muted hover:text-white hover:border-border/80'
        }`}
      >
        <span className="truncate">{triggerLabel}</span>
        <svg className="w-3 h-3 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1 p-2 border-b border-border">
              {selected.map(s => (
                <span key={s} className="bg-accent/20 text-accent text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="truncate max-w-[120px]">{s}</span>
                  <button onClick={() => remove(s)} className="font-bold">×</button>
                </span>
              ))}
              <button onClick={() => onChange([])} className="text-[11px] text-dip-red ml-1">Clear</button>
            </div>
          )}
          {/* Search input */}
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder={placeholder || `Search ${label.toLowerCase()}...`}
              className="w-full bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-muted outline-none focus:border-accent/50"
              autoFocus
            />
          </div>
          {/* Results */}
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-t border-border">
              {results.map(r => (
                <button
                  key={r.label}
                  onClick={() => add(r.label)}
                  className="w-full text-left px-3 py-2 text-xs text-white hover:bg-accent/10 flex items-center justify-between"
                >
                  <span className="truncate">{r.label}</span>
                  <span className="text-muted text-[10px] ml-2 flex-shrink-0">{r.cnt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Simple select wrapper ─── */
function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className={`px-2.5 py-1.5 rounded-lg text-xs border bg-card outline-none cursor-pointer transition-colors ${
        value ? 'border-accent/40 text-accent bg-accent/10' : 'border-border text-muted hover:text-white'
      }`}
      title={label}
    >
      <option value="">{allLabel}</option>
      {options.map(o => (
        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Desktop Filter Bar ─── */
export default function DesktopFilterBar({ filters, setFilter, setFilters, filterOptions, resetFilters, activeFilterCount }) {
  const opts = filterOptions || { communities: [], property_names: [], types: [], sources: [] };

  return (
    <div className="bg-card/50 border border-border rounded-xl px-4 py-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Label */}
        <span className="text-xs font-semibold text-muted uppercase tracking-wider mr-1">Filters</span>

        {/* Purpose */}
        <FilterSelect
          label="Purpose"
          value={filters.purpose}
          onChange={v => setFilter('purpose', v)}
          options={[{ value: 'sale', label: 'Sale' }, { value: 'rent', label: 'Rent' }]}
          allLabel="Purpose"
        />

        {/* Type */}
        <FilterSelect
          label="Type"
          value={filters.type}
          onChange={v => setFilter('type', v)}
          options={opts.types}
          allLabel="Type"
        />

        {/* Bedrooms */}
        <FilterSelect
          label="Bedrooms"
          value={filters.bedrooms}
          onChange={v => setFilter('bedrooms', v)}
          options={[
            { value: '0', label: 'Studio' },
            { value: '1', label: '1 Bed' },
            { value: '2', label: '2 Bed' },
            { value: '3', label: '3 Bed' },
            { value: '4', label: '4+ Bed' },
          ]}
          allLabel="Beds"
        />

        {/* Source */}
        <FilterSelect
          label="Source"
          value={filters.source}
          onChange={v => setFilter('source', v)}
          options={opts.sources}
          allLabel="Source"
        />

        {/* Community multi-select */}
        <MultiSelectDropdown
          label="Community"
          selected={filters.communities || []}
          onChange={v => setFilter('communities', v)}
          fetchUrl="/api/search-community"
        />

        {/* Building multi-select */}
        <MultiSelectDropdown
          label="Building"
          selected={filters.buildings || []}
          onChange={v => setFilter('buildings', v)}
          fetchUrl="/api/search-building"
        />

        {/* Divider */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* Date From */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted">From</span>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={e => setFilter('date_from', e.target.value)}
            className={`px-2 py-1.5 rounded-lg text-xs border bg-card outline-none ${
              filters.date_from ? 'border-accent/40 text-accent' : 'border-border text-muted'
            }`}
          />
        </div>

        {/* Date To */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted">To</span>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={e => setFilter('date_to', e.target.value)}
            className={`px-2 py-1.5 rounded-lg text-xs border bg-card outline-none ${
              filters.date_to ? 'border-accent/40 text-accent' : 'border-border text-muted'
            }`}
          />
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border mx-1" />

        {/* Min Dip % */}
        {/* Max Price */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted">Max Price</span>
          <input
            type="number"
            min="0"
            value={filters.max_price || ''}
            onChange={e => setFilter('max_price', e.target.value)}
            placeholder="AED"
            className={`w-24 px-2 py-1.5 rounded-lg text-xs border bg-card outline-none ${
              filters.max_price ? 'border-accent/40 text-accent' : 'border-border text-muted'
            }`}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Reset */}
        {activeFilterCount > 0 && (
          <button
            onClick={resetFilters}
            className="text-xs text-dip-red hover:text-red-400 transition-colors"
          >
            Reset ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  );
}
