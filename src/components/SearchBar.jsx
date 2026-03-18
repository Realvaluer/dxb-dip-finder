import { useState, useEffect, useRef } from 'react';

export default function SearchBar({ value, onChange, onSelectCommunity, onSelectBuilding }) {
  const [local, setLocal] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => { setLocal(value); }, [value]);

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
    clearTimeout(timerRef.current);
    if (v.length < 2) { setSuggestions(null); setOpen(false); return; }
    timerRef.current = setTimeout(() => {
      fetch(`/api/search-suggestions?q=${encodeURIComponent(v)}`)
        .then(r => r.json())
        .then(d => { setSuggestions(d); setOpen(true); })
        .catch(() => {});
    }, 300);
  }

  function selectCommunity(label) {
    setLocal('');
    setOpen(false);
    setSuggestions(null);
    onSelectCommunity(label);
  }

  function selectBuilding(label) {
    setLocal('');
    setOpen(false);
    setSuggestions(null);
    onSelectBuilding(label);
  }

  const hasSuggestions = suggestions && (suggestions.communities?.length > 0 || suggestions.buildings?.length > 0);

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
            onClick={() => { setLocal(''); onChange(''); setSuggestions(null); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Dropdown */}
        {open && suggestions && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
            {suggestions.communities?.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-medium">Communities</div>
                {suggestions.communities.map(s => (
                  <button key={s.label} onClick={() => selectCommunity(s.label)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[44px] flex items-center justify-between">
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted text-[10px] ml-2">{s.cnt}</span>
                  </button>
                ))}
              </>
            )}
            {suggestions.buildings?.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-medium border-t border-border">Buildings</div>
                {suggestions.buildings.map(s => (
                  <button key={s.label} onClick={() => selectBuilding(s.label)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-accent/10 active:bg-accent/20 min-h-[44px] flex items-center justify-between">
                    <span className="truncate">{s.label}</span>
                    <span className="text-muted text-[10px] ml-2">{s.cnt}</span>
                  </button>
                ))}
              </>
            )}
            {!hasSuggestions && (
              <div className="px-3 py-4 text-xs text-muted text-center">No results for "{local}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
