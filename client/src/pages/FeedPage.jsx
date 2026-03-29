import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
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

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'DXB Dip Finder',
  url: 'https://dxbdipfinder.com',
  description: 'Track property price drops across 20 Dubai communities daily. Find below-market-value deals updated from PropertyFinder and Bayut.',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: 'https://dxbdipfinder.com/?q={search_term_string}'
    },
    'query-input': 'required name=search_term_string'
  }
};

const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'DXB Dip Finder',
  url: 'https://dxbdipfinder.com',
  logo: 'https://dxbdipfinder.com/logo.png',
  sameAs: [
    'https://twitter.com/dxbdipfinder',
    'https://www.instagram.com/dxbdipfinder'
  ]
};

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
      <SEO
        title="Find Dubai Property Price Drops — Live Deal Tracker"
        description="DXB Dip Finder tracks property price reductions across 20 Dubai communities daily. Find below-market deals in JVC, Business Bay, Dubai Marina, Downtown and more."
        canonical="/"
        keywords={[
          'Dubai property price drop',
          'Dubai real estate deals',
          'below market value property Dubai',
          'motivated seller Dubai',
          'undervalued property Dubai',
          'Dubai property price reduced'
        ]}
        structuredData={[websiteSchema, orgSchema]}
      />
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
