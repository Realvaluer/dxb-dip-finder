import { useState, useEffect, useCallback, useRef } from 'react';
import useFilters from '../hooks/useFilters';
import useMediaQuery from '../hooks/useMediaQuery';
import useBookmarks from '../hooks/useBookmarks';
import { useFetch, useDebouncedFetch } from '../hooks/useApi';
import TopBar from '../components/TopBar';
import SearchBar from '../components/SearchBar';
import KPICards from '../components/KPICards';
import ListingCard from '../components/ListingCard';
import FilterSheet from '../components/FilterSheet';
import BottomNav from '../components/BottomNav';
import ListingsTable from '../components/ListingsTable';
import DesktopFilterBar from '../components/DesktopFilterBar';
import Pagination from '../components/Pagination';
import { SkeletonCards } from '../components/Skeleton';
import { trackFilter } from '../lib/analytics';

const SORT_OPTIONS = [
  { value: 'newest', label: '↓ Most recent' },
  { value: 'dip_pct', label: '↓ vs Transaction %' },
  { value: 'dip_aed', label: '↓ vs Transaction AED' },
  { value: 'listing_change', label: '↓ Same listing' },
  { value: 'price_asc', label: '↑ Price low–high' },
  { value: 'price_desc', label: '↓ Price high–low' },
];

const PURPOSE_OPTIONS = [
  { value: '', label: 'Sale + Rent' },
  { value: 'sale', label: 'Sale only' },
  { value: 'rent', label: 'Rent only' },
];

const DESKTOP_PAGE_SIZE = 100;

export default function Feed() {
  const { filters, setFilter, setFilters, resetFilters, activeFilterCount, queryString } = useFilters();
  const { toggle, isBookmarked } = useBookmarks();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Desktop pagination state
  const [page, setPage] = useState(1);

  // Reset page to 1 when filters change
  const isFirstRender = useRef(true);
  useEffect(() => {
    setPage(1);
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (isDesktop) trackFilter(filters);
  }, [queryString]);

  // Build API URL — only request count on first page load (saves ~444ms on scroll/pagination)
  const needsCount = isDesktop ? page === 1 : true; // mobile always needs count for "X results" display
  const apiUrl = isDesktop
    ? `/api/listings?${queryString}&limit=${DESKTOP_PAGE_SIZE}&offset=${(page - 1) * DESKTOP_PAGE_SIZE}${needsCount ? '&count=true' : ''}`
    : `/api/listings?${queryString}&limit=30&count=true`;
  const kpiUrl = `/api/kpis?${queryString}`;

  const { data: listingsData, loading: listingsLoading, error: listingsError } = useDebouncedFetch(apiUrl, [queryString, isDesktop, page]);
  const { data: kpiData, loading: kpiLoading } = useDebouncedFetch(kpiUrl, [queryString]);
  const { data: filterOptions } = useFetch('/api/filter-options', []);

  // Sale data is now included inline in /api/listings response — no separate fetch needed

  // Mobile: infinite scroll state
  const [allListings, setAllListings] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (listingsData && !isDesktop) {
      setAllListings(listingsData.listings || []);
      setHasMore((listingsData.listings?.length || 0) < (listingsData.total || 0));
    }
  }, [listingsData, isDesktop]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || isDesktop) return;
    setLoadingMore(true);
    const offset = allListings.length;
    fetch(`/api/listings?${queryString}&limit=30&offset=${offset}`)
      .then(r => r.json())
      .then(d => {
        const newItems = d.listings || [];
        setAllListings(prev => [...prev, ...newItems]);
        // If fewer than 30 returned, no more to load. Otherwise use total from initial load.
        setHasMore(newItems.length >= 30);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [queryString, allListings.length, loadingMore, hasMore, isDesktop]);

  useEffect(() => {
    if (isDesktop) return; // No infinite scroll on desktop
    function onScroll() {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
        loadMore();
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loadMore, isDesktop]);

  // SSE: listen for database updates and auto-refresh
  useEffect(() => {
    let evtSource;
    try {
      evtSource = new EventSource('/api/events');
      evtSource.onmessage = (e) => {
        if (e.data === 'refresh') {
          window.location.reload();
        }
      };
    } catch {}
    return () => evtSource?.close();
  }, []);

  // Desktop computed values
  const desktopListings = isDesktop ? (listingsData?.listings || []) : [];
  const total = listingsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / DESKTOP_PAGE_SIZE));

  // Date filter chip display
  const hasDateFilter = filters.date_from || filters.date_to;

  return (
    <div className={`min-h-screen bg-bg ${isDesktop ? 'pb-4' : 'pb-20'}`}>
      <TopBar
        onFilterClick={() => setSheetOpen(true)}
        activeFilterCount={activeFilterCount}
        isDesktop={isDesktop}
      />

      {/* Desktop layout */}
      {isDesktop ? (
        <div className="max-w-[1440px] mx-auto px-6 pt-4">
          <SearchBar
            value={filters.search}
            onChange={v => setFilter('search', v)}
            activeCommunities={filters.communities}
            activeBuildings={filters.buildings}
            onSelectCommunity={c => {
              const updated = filters.communities.includes(c) ? filters.communities : [...filters.communities, c];
              setFilters({ communities: updated, search: '' });
            }}
            onSelectBuilding={b => {
              const updated = filters.buildings.includes(b) ? filters.buildings : [...filters.buildings, b];
              setFilters({ buildings: updated, search: '' });
            }}
          />

          <KPICards
            data={kpiData}
            loading={kpiLoading}
            onCommunityClick={c => setFilter('communities', [c])}
          />

          <DesktopFilterBar
            filters={filters}
            setFilter={setFilter}
            setFilters={setFilters}
            filterOptions={filterOptions}
            resetFilters={resetFilters}
            activeFilterCount={activeFilterCount}
          />

          {/* Results count + sort */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">
              {total.toLocaleString()} results
            </span>
            <select
              value={filters.sort}
              onChange={e => setFilter('sort', e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-white outline-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Table */}
          {listingsError ? (
            <div className="py-12 text-center">
              <div className="text-muted mb-2">Couldn't load listings</div>
              <button onClick={() => window.location.reload()} className="bg-accent text-white px-4 py-2 rounded-xl text-sm">
                Retry
              </button>
            </div>
          ) : listingsLoading ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted animate-pulse">
              Loading listings...
            </div>
          ) : desktopListings.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-white font-medium mb-1">No listings match your filters</div>
              <div className="text-muted text-sm mb-4">Try adjusting your filters</div>
              <button onClick={resetFilters} className="bg-accent text-white px-4 py-2 rounded-xl text-sm">
                Reset filters
              </button>
            </div>
          ) : (
            <>
              <ListingsTable
                listings={desktopListings}
                sort={filters.sort}
                onSortChange={v => setFilter('sort', v)}
              />
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={DESKTOP_PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      ) : (
        /* Mobile layout — unchanged */
        <>
          <SearchBar
            value={filters.search}
            onChange={v => setFilter('search', v)}
            activeCommunities={filters.communities}
            activeBuildings={filters.buildings}
            onSelectCommunity={c => {
              const updated = filters.communities.includes(c) ? filters.communities : [...filters.communities, c];
              setFilters({ communities: updated, search: '' });
            }}
            onSelectBuilding={b => {
              const updated = filters.buildings.includes(b) ? filters.buildings : [...filters.buildings, b];
              setFilters({ buildings: updated, search: '' });
            }}
          />

          {/* Active filter chips */}
          {(filters.search || filters.communities.length > 0 || filters.buildings.length > 0 || hasDateFilter || filters.type || filters.bedrooms !== '' || filters.max_price || filters.min_sqft) && (
            <div className="px-4 pb-1 flex items-center gap-2 flex-wrap overflow-hidden">
              {filters.search && (
                <span className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  {filters.search}
                  <button onClick={() => setFilter('search', '')} className="font-bold">×</button>
                </span>
              )}
              {filters.communities.map(c => (
                <span key={`c-${c}`} className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  {c}
                  <button onClick={() => setFilter('communities', filters.communities.filter(x => x !== c))} className="font-bold">×</button>
                </span>
              ))}
              {filters.buildings.map(b => (
                <span key={`b-${b}`} className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  {b}
                  <button onClick={() => setFilter('buildings', filters.buildings.filter(x => x !== b))} className="font-bold">×</button>
                </span>
              ))}
              {filters.type && (
                <span className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  {filters.type}
                  <button onClick={() => setFilter('type', '')} className="font-bold">×</button>
                </span>
              )}
              {filters.bedrooms !== '' && (
                <span className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  {filters.bedrooms === '0' ? 'Studio' : `${filters.bedrooms} Bed`}
                  <button onClick={() => setFilter('bedrooms', '')} className="font-bold">×</button>
                </span>
              )}
              {hasDateFilter && (
                <span className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  {filters.date_from || '...'} – {filters.date_to || '...'}
                  <button onClick={() => setFilters({ date_from: '', date_to: '' })} className="font-bold">×</button>
                </span>
              )}
              {filters.max_price && (
                <span className="bg-accent/20 text-accent text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                  Max AED {parseInt(filters.max_price).toLocaleString()}
                  <button onClick={() => setFilter('max_price', '')} className="font-bold">×</button>
                </span>
              )}
              <button onClick={resetFilters} className="text-dip-red text-[11px] font-medium whitespace-nowrap">
                Clear
              </button>
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
              className="flex-1 bg-card border border-border rounded-xl px-2.5 py-2 text-[11px] text-white outline-none min-h-[36px] appearance-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filters.purpose}
              onChange={e => setFilter('purpose', e.target.value)}
              className="flex-1 bg-card border border-border rounded-xl px-2.5 py-2 text-[11px] text-white outline-none min-h-[36px] appearance-none"
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
            filterOptions={filterOptions}
          />
        </>
      )}
    </div>
  );
}
