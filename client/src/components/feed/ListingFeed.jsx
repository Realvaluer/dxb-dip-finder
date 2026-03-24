import { useEffect, useRef } from 'react';
import ListingCard from './ListingCard';
import SkeletonCard from '../ui/SkeletonCard';

export default function ListingFeed({ listings, loading, loadingMore, hasMore, loadMore }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);
    return () => { if (sentinel) observer.unobserve(sentinel); };
  }, [hasMore, loadingMore, loadMore]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-4">
        {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4">
      {listings.map(listing => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
      {loadingMore && <SkeletonCard />}
      {hasMore && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}
