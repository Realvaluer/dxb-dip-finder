import { useFetch } from '../hooks/useApi';
import useBookmarks from '../hooks/useBookmarks';
import ListingCard from '../components/ListingCard';
import BottomNav from '../components/BottomNav';
import { SkeletonCards } from '../components/Skeleton';

export default function Saved() {
  const { bookmarks, toggle, isBookmarked } = useBookmarks();

  const apiUrl = bookmarks.length > 0 ? `/api/listings?ids=${bookmarks.join(',')}&limit=200` : null;
  const { data, loading } = useFetch(apiUrl || '/api/listings?ids=-1&limit=0', [bookmarks.join(',')]);

  return (
    <div className="min-h-screen bg-bg pb-20">
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 border-b border-border">
        <h1 className="text-lg font-bold">Saved Listings</h1>
      </div>

      {bookmarks.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <div className="text-white font-medium mb-1">No saved listings yet</div>
          <div className="text-muted text-sm">Tap the bookmark icon on any listing to save it here</div>
        </div>
      ) : loading ? (
        <div className="px-4 pt-4"><SkeletonCards count={3} /></div>
      ) : (
        <div className="px-4 pt-4 flex flex-col gap-3">
          {(data?.listings || []).map(l => (
            <ListingCard key={l.id} listing={l} bookmarked={isBookmarked(l.id)} onToggleBookmark={toggle} />
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
