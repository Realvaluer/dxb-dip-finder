import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const SORT_OPTIONS = [
  { value: 'dip_pct', label: 'Biggest dip %' },
  { value: 'dip_aed', label: 'Biggest dip AED' },
  { value: 'newest', label: 'Most recent' },
  { value: 'price_asc', label: 'Price: low → high' },
  { value: 'price_desc', label: 'Price: high → low' },
];

const LISTING_TYPE_OPTIONS = [
  { value: '', label: 'Both' },
  { value: 'Sale', label: 'Sale only' },
  { value: 'Rent', label: 'Rent only' },
];

export default function FilterChips() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSort = searchParams.get('sort') || 'dip_pct';
  const currentListingType = searchParams.get('listing_type') || '';

  const [sortOpen, setSortOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const sortRef = useRef(null);
  const typeRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
      if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setParam = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (!value || value === 'dip_pct' && key === 'sort') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    setSearchParams(params);
  };

  const sortLabel = SORT_OPTIONS.find(o => o.value === currentSort)?.label || 'Biggest dip %';
  const typeLabel = LISTING_TYPE_OPTIONS.find(o => o.value === currentListingType)?.label || 'Both';

  return (
    <div className="flex gap-2 px-4 py-1">
      {/* Sort dropdown */}
      <div ref={sortRef} className="relative flex-1">
        <button
          onClick={() => { setSortOpen(!sortOpen); setTypeOpen(false); }}
          className="w-full flex items-center justify-between gap-1 bg-brand-900/60 border border-brand-800 rounded-lg px-3 py-2 text-sm text-gray-300"
        >
          <span className="truncate">↓ {sortLabel}</span>
          <svg className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${sortOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {sortOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-brand-950 border border-brand-800 rounded-lg shadow-xl overflow-hidden">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setParam('sort', opt.value); setSortOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  currentSort === opt.value ? 'bg-brand-700 text-brand-200' : 'text-gray-400 hover:bg-brand-900/60'
                }`}
              >
                {opt.label}
                {currentSort === opt.value && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Listing type dropdown */}
      <div ref={typeRef} className="relative flex-1">
        <button
          onClick={() => { setTypeOpen(!typeOpen); setSortOpen(false); }}
          className="w-full flex items-center justify-between gap-1 bg-brand-900/60 border border-brand-800 rounded-lg px-3 py-2 text-sm text-gray-300"
        >
          <span className="truncate">{typeLabel}</span>
          <svg className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${typeOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {typeOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-brand-950 border border-brand-800 rounded-lg shadow-xl overflow-hidden">
            {LISTING_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setParam('listing_type', opt.value); setTypeOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                  currentListingType === opt.value ? 'bg-brand-700 text-brand-200' : 'text-gray-400 hover:bg-brand-900/60'
                }`}
              >
                {opt.label}
                {currentListingType === opt.value && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
