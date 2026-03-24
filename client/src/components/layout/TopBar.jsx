import { useState, useEffect } from 'react';

export default function TopBar({ onFilterClick }) {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const lastOpened = localStorage.getItem('dip_last_opened');
    if (!lastOpened) {
      setHasNew(true);
      return;
    }
    fetch('/api/listings?sort=newest&limit=1')
      .then(r => r.json())
      .then(res => {
        if (res.data?.[0]?.scraped_at > lastOpened) setHasNew(true);
      })
      .catch(() => {});
  }, []);

  const handleBell = () => {
    localStorage.setItem('dip_last_opened', new Date().toISOString());
    setHasNew(false);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-bold text-gray-100">Dip Finder</span>
        <span className="w-2 h-2 rounded-full bg-brand-400 mt-0.5" />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleBell} className="relative p-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {hasNew && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-400" />
          )}
        </button>
        <button onClick={onFilterClick} className="p-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        </button>
      </div>
    </div>
  );
}
