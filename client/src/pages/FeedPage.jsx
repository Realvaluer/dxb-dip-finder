import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import TopBar from '../components/layout/TopBar';
import BottomSheet from '../components/layout/BottomSheet';
import SearchInput from '../components/ui/SearchInput';
import KpiCards from '../components/feed/KpiCards';
import FilterChips from '../components/feed/FilterChips';
import ListingFeed from '../components/feed/ListingFeed';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import useListings from '../hooks/useListings';
import { fetchAreas } from '../api/client';

export default function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [areas, setAreas] = useState([]);
  const { listings, total, loading, loadingMore, error, hasMore, loadMore } = useListings();

  useEffect(() => {
    fetchAreas().then(setAreas).catch(() => {});
  }, []);

  const handleSearch = (value) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('search', value);
    else params.delete('search');
    setSearchParams(params);
  };

  const handleReset = () => setSearchParams({});

  return (
    <div className="flex flex-col gap-3 pb-6">
      <TopBar onFilterClick={() => setSheetOpen(true)} />

      <div className="px-4">
        <SearchInput
          value={searchParams.get('search') || ''}
          onChange={handleSearch}
        />
      </div>

      <KpiCards />

      <FilterChips />

      {!loading && !error && (
        <div className="px-4">
          <p className="text-xs text-gray-500">
            {total.toLocaleString()} results
          </p>
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      ) : !loading && listings.length === 0 ? (
        <EmptyState onReset={handleReset} />
      ) : (
        <ListingFeed
          listings={listings}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          loadMore={loadMore}
        />
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        areas={areas}
      />
    </div>
  );
}
