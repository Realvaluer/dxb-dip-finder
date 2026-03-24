import { useState, useRef, useEffect } from 'react';

export default function SearchableMultiSelect({ label, placeholder, options = [], selected = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const toggle = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter(s => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  const remove = (item) => onChange(selected.filter(s => s !== item));

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(true)}
        className="w-full bg-brand-900/60 border border-brand-800 rounded-lg px-3 py-2 text-sm text-gray-300 cursor-pointer min-h-[38px]"
      >
        {selected.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selected.map(s => (
              <span key={s} className="inline-flex items-center gap-1 bg-brand-700 text-brand-200 text-xs px-2 py-0.5 rounded-full">
                {s}
                <button
                  onClick={(e) => { e.stopPropagation(); remove(s); }}
                  className="text-brand-300 hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-600">{placeholder || `All ${label}`}</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-brand-950 border border-brand-800 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-brand-800">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${label?.toLowerCase() || ''}...`}
              className="w-full bg-brand-900/60 border border-brand-800 rounded px-2.5 py-1.5 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-brand-600"
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <div className="px-2 pt-1">
              <button
                onClick={() => { onChange([]); setQuery(''); }}
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                Clear all
              </button>
            </div>
          )}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-600 p-3 text-center">No matches</p>
            ) : (
              filtered.slice(0, 100).map(item => (
                <button
                  key={item}
                  onClick={() => toggle(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-brand-900/60"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    selected.includes(item) ? 'bg-brand-700 border-brand-600' : 'border-brand-700'
                  }`}>
                    {selected.includes(item) && (
                      <svg className="w-3 h-3 text-brand-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-gray-300 truncate">{item}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
