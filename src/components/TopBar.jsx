import { useEffect, useState } from 'react';

export default function TopBar({ onFilterClick, activeFilterCount }) {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const lastSeen = localStorage.getItem('dip_last_seen');
    fetch('/api/listings?sort=newest&limit=1')
      .then(r => r.json())
      .then(d => {
        if (d.listings?.[0]) {
          const newest = d.listings[0].date_listed;
          if (lastSeen && newest > lastSeen) {
            setHasNew(true);
          }
          localStorage.setItem('dip_last_seen', newest);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-border">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight">Dip Finder</span>
        <span className="w-2 h-2 rounded-full bg-accent mt-0.5" />
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {hasNew && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-accent" />}
        </button>
        <button
          onClick={onFilterClick}
          className="relative p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {activeFilterCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-accent text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
