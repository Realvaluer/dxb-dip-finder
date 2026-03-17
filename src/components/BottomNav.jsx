export default function BottomNav() {
  const tabs = [
    { label: 'Feed', active: true, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { label: 'Search', active: false, icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { label: 'Saved', active: false, icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z' },
    { label: 'Profile', active: false, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-bg/95 backdrop-blur-sm border-t border-border z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around py-2">
        {tabs.map(tab => (
          <button
            key={tab.label}
            disabled={!tab.active}
            className={`flex flex-col items-center gap-0.5 min-h-[44px] min-w-[44px] justify-center ${
              tab.active ? 'text-accent' : 'text-muted/40'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            <span className="text-[10px]">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
