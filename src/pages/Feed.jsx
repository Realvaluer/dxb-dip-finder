import { useState, useEffect, useCallback } from 'react';
import useFilters from '../hooks/useFilters';
import useBookmarks from '../hooks/useBookmarks';
import { useFetch, useDebouncedFetch } from '../hooks/useApi';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import KPICards from '../components/KPICards';
import ListingCard from '../components/ListingCard';
import FilterSheet from '../components/FilterSheet';
import BottomNav from '../components/BottomNav';
import { SkeletonCards } from '../components/Skeleton';

const SORT_OPTIONS = [
  { value: 'newest', label: '↓ Most recent' },
  { value: 'dip_pct', label: '↓ Biggest dip %' },
  { value: 'dip_aed', label: '↓ Biggest dip AED' },
  { value: 'price_asc', label: '↑ Price low–high' },
  { value: 'price_desc', label: '↓ Price high–low' },
];

const PURPOSE_OPTIONS = [
  { value: '', label: 'Sale + Rent' },
  { value: 'sale', label: 'Sale only' },
  { value: 'rent', label: 'Rent only' },
];

export default function Feed() {
  const { filters, setFilter, setFilters, resetFilters, activeFilterCount, queryString } = useFilters();
  const { toggle, isBookmarked } = useBookmarks();
  const [sheetOpen, setSheetOpen] = useState(false);

  const apiUrl = `/api/listings?${queryString}&limit=50`;
  const kpiUrl = `/api/kpis?${queryString}`;

  const { data: listingsData, loading: listingsLoading, error: listingsError } = useDebouncedFetch(apiUrl, [queryString]);
  const { data: kpiData, loading: kpiLoading } = useDebouncedFetch(kpiUrl, [queryString]);
  const { data: filterOptions } = useFetch('/api/filter-options', []);

  const [allListings, setAllListings] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (listingsData) {
      setAllListings(listingsData.listings || []);
      setHasMore((listingsData.listings?.length || 0) < (listingsData.total || 0));
    }
  }, [listingsData]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const offset = allListings.length;
    fetch(`/api/listings?${queryString}&limit=50&offset=${offset}`)
      .then(r => r.json())
      .then(d => {
        const newItems = d.listings || [];
        setAllListings(prev => [...prev, ...newItems]);
        setHasMore(offset + newItems.length < d.total);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [queryString, allListings.length, loadingMore, hasMore]);

  useEffect(() => {
    function onScroll() {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
        loadMore();
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loadMore]);

  // Date filter chip display
  const hasDateFilter = filters.date_from || filters.date_to;

  return (
    <div className="min-h-screen bg-bg pb-20">
      <TopBar onFilterClick={() => setSheetOpen(true)} activeFilterCount={activeFilterCount} />
      <SearchBar
        value={filters.search}
        onChange={v => setFilter('search', v)}
        onSelectCommunity={c => setFilters({ communities: [c], search: '' })}
        onSelectBuilding={b => setFilters({ buildings: [b], search: '' })}
      />

      {/* Active date chip */}
      {hasDateFilter && (
        <div className="px-4 pb-1 flex items-center gap-2">
          <span className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5">
            {filters.date_from || '...'} – {filters.date_to || '...'}
            <button onClick={() => { setFilter('date_from', ''); setFilter('date_to', ''); }} className="ml-0.5 font-bold">×</button>
          </span>
        </div>
      )}

      <KPICards
        data={kpiData}
        loading={kpiLoading}
        onCommunityClick={c => setFilter('communities', [c])}
      />

      {/* Header controls: sort + purpose */}
      <div className="px-4 py-2 flex gap-2">
        <select
          value={filters.sort}
          onChange={e => setFilter('sort', e.target.value)}
          className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-white outline-none min-h-[44px] appearance-none"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={filters.purpose}
          onChange={e => setFilter('purpose', e.target.value)}
          className="flex-1 bg-card border border-border rounded-xl px-3 py-2.5 text-xs text-white outline-none min-h-[44px] appearance-none"
        >
          {PURPOSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Results count */}
      <div className="px-4 pb-2">
        <span className="text-xs text-muted">
          {listingsData ? `${listingsData.total?.toLocaleString()} results` : ''}
        </span>
      </div>

      {/* Listings */}
      {listingsError ? (
        <div className="px-4 py-12 text-center">
          <div className="text-muted mb-2">Couldn't load listings</div>
          <button onClick={() => window.location.reload()} className="bg-accent text-white px-4 py-2 rounded-xl text-sm min-h-[44px]">
            Retry
          </button>
        </div>
      ) : listingsLoading ? (
        <SkeletonCards count={4} />
      ) : allListings.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <div className="text-white font-medium mb-1">No listings match your filters</div>
          <div className="text-muted text-sm mb-4">Try lowering the min dip % or clearing some filters</div>
          <button onClick={resetFilters} className="bg-accent text-white px-4 py-2 rounded-xl text-sm min-h-[44px]">
            Reset filters
          </button>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {allListings.map(l => (
            <ListingCard key={l.id} listing={l} bookmarked={isBookmarked(l.id)} onToggleBookmark={toggle} />
          ))}
          {loadingMore && <SkeletonCards count={2} />}
          {!hasMore && allListings.length > 0 && (
            <div className="text-center text-xs text-muted py-4">End of results</div>
          )}
        </div>
      )}

      <BottomNav />

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        setFilter={setFilter}
        resetFilters={resetFilters}
        resultCount={listingsData?.total}
        filterOptions={filterOptions}
      />
    </div>
  );
}
