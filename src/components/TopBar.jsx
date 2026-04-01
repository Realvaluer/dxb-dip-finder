import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useNotifications from '../hooks/useNotifications';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function TopBar({ onFilterClick, activeFilterCount, isDesktop }) {
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { count, notifications, loading, fetchAll, dismiss, dismissAll } = useNotifications();

  // Close panel on click outside
  useEffect(() => {
    if (!bellOpen) return;
    function handleClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bellOpen]);

  function handleBellClick() {
    if (!bellOpen) fetchAll();
    setBellOpen(!bellOpen);
  }

  function handleNotifClick(n) {
    setBellOpen(false);
    if (n.type === 'new_match' && n.saved_listing_id) {
      navigate(`/matches/${n.saved_listing_id}`);
    } else {
      navigate(`/listing/${n.listing_id}`);
    }
  }

  const navItems = [
    { label: 'Feed', path: '/' },
    { label: 'Saved', path: '/saved' },
    { label: 'Profile', path: '/profile' },
  ];

  return (
    <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-border">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight">Dip Finder</span>
        <span className="w-2 h-2 rounded-full bg-accent mt-0.5" />
      </div>

      {/* Desktop: nav links */}
      {isDesktop && (
        <div className="flex items-center gap-6 ml-8">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`text-sm font-medium transition-colors ${
                location.pathname === item.path ? 'text-accent' : 'text-muted hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div ref={bellRef} className="relative">
          <button onClick={handleBellClick} className="relative p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {count > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-accent text-[10px] font-bold flex items-center justify-center px-1">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>

          {/* Notification panel */}
          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl shadow-lg w-80 max-h-[400px] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold">Notifications</span>
                {notifications.length > 0 && (
                  <button onClick={dismissAll} className="text-[11px] text-accent">Mark all read</button>
                )}
              </div>
              <div className="overflow-y-auto max-h-[340px]">
                {loading ? (
                  <div className="p-4 text-center text-sm text-muted animate-pulse">Loading...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">No notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-border/50 last:border-0">
                      <div className="mt-0.5 shrink-0">
                        {n.type === 'price_drop' ? (
                          <span className="text-dip-red text-base">&#x25BC;</span>
                        ) : (
                          <span className="text-accent text-base">&#x2726;</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0" onClick={() => handleNotifClick(n)}>
                        <div className="text-xs text-white leading-snug">{n.message}</div>
                        <div className="text-[10px] text-muted mt-1">{timeAgo(n.created_at)}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                        className="shrink-0 text-muted hover:text-white text-xs p-1"
                      >
                        &times;
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hide filter button on desktop — filters are inline */}
        {!isDesktop && (
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
        )}
      </div>
    </div>
  );
}
