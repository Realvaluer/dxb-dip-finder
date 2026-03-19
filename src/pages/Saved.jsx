import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import useBookmarks from '../hooks/useBookmarks';
import ListingCard from '../components/ListingCard';
import BottomNav from '../components/BottomNav';
import { SkeletonCards } from '../components/Skeleton';

export default function Saved() {
  const { user, isAuthenticated, openAuth } = useAuth();
  const { toggle, isBookmarked } = useBookmarks();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user?.token) { setLoading(false); return; }
    setLoading(true);
    fetch('/api/saved', { headers: { Authorization: `Bearer ${user.token}` } })
      .then(r => r.ok ? r.json() : { listings: [] })
      .then(d => { setListings(d.listings || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isAuthenticated, user?.token]);

  return (
    <div className="min-h-screen bg-bg pb-20">
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 border-b border-border">
        <h1 className="text-lg font-bold">Saved Listings</h1>
      </div>

      {!isAuthenticated ? (
        <div className="px-4 py-16 text-center">
          <div className="text-white font-medium mb-2">Sign in to save listings</div>
          <div className="text-muted text-sm mb-4">Save properties and get alerts when similar ones appear</div>
          <button onClick={() => openAuth()} className="bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-semibold min-h-[44px]">
            Sign in
          </button>
        </div>
      ) : loading ? (
        <div className="px-4 pt-4"><SkeletonCards count={3} /></div>
      ) : listings.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <div className="text-white font-medium mb-1">No saved listings yet</div>
          <div className="text-muted text-sm">Tap the bookmark icon on any listing to save it here</div>
        </div>
      ) : (
        <div className="px-4 pt-4 flex flex-col gap-3">
          {listings.map(l => (
            <ListingCard key={l.id} listing={l} bookmarked={isBookmarked(l.id)} onToggleBookmark={toggle} />
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
