import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Navigate, useSearchParams } from 'react-router-dom';
import useMediaQuery from '../hooks/useMediaQuery';
import useBookmarks from '../hooks/useBookmarks';
import { useFetch, useDebouncedFetch } from '../hooks/useApi';
import SEO from '../components/SEO';
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
import { communityBySlug } from '../data/communities';

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

export default function CommunityPage() {
  const { slug } = useParams();
  const community = communityBySlug[slug];

  // If slug doesn't match any community, redirect to home
  if (!community) return <Navigate to="/" replace />;

  return <CommunityFeed community={community} />;
}

function CommunityFeed({ community }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toggle, isBookmarked } = useBookmarks();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Build filters from search params, always forcing this community
  const filters = useMemo(() => ({
    search: searchParams.get('search') || '',
    purpose: searchParams.get('purpose') || '',
    sort: searchParams.get('sort') || 'newest',
    type: searchParams.get('type') || '',
    source: searchParams.get('source') || '',
    bedrooms: searchParams.get('bedrooms') || '',
    min_dip: searchParams.get('min_dip') || '',
    max_price: searchParams.get('max_price') || '',
    min_sqft: searchParams.get('min_sqft') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    communities: [community.name],
    buildings: searchParams.getAll('property_name[]'),
  }), [searchParams, community.name]);

  const setFilter = useCallback((key, value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (key === 'buildings') {
        next.delete('property_name[]');
        (value || []).forEach(v => next.append('property_name[]', v));
      } else if (!value && value !== 0) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }, [setSearchParams]);

  const setFilters = useCallback((updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'communities') continue; // locked to this community
        if (key === 'buildings') {
          next.delete('property_name[]');
          (value || []).forEach(v => next.append('property_name[]', v));
        } else if (!value && value !== 0) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    });
  }, [setSearchParams]);

  const resetFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.purpose) count++;
    if (filters.type) count++;
    if (filters.source) count++;
    if (filters.bedrooms) count++;
    if (filters.min_dip) count++;
    if (filters.max_price) count++;
    if (filters.min_sqft) count++;
    if (filters.date_from || filters.date_to) count++;
    if (filters.buildings.length) count++;
    return count;
  }, [filters]);

  // Build query string with community always included
  const queryString = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    // Always inject the community
    params.delete('community[]');
    params.append('community[]', community.name);
    return params.toString();
  }, [searchParams, community.name]);

  // Reset page when filters change
  const isFirstRender = useRef(true);
  useEffect(() => {
    setPage(1);
    if (isFirstRender.current) { isFirstRender.current = false; return; }
  }, [queryString]);

  const needsCount = isDesktop ? page === 1 : true;
  const apiUrl = isDesktop
    ? `/api/listings?${queryString}&limit=${DESKTOP_PAGE_SIZE}&offset=${(page - 1) * DESKTOP_PAGE_SIZE}${needsCount ? '&count=true' : ''}`
    : `/api/listings?${queryString}&limit=30&count=true`;
  const kpiUrl = `/api/kpis?${queryString}`;

  const { data: listingsData, loading: listingsLoading, error: listingsError } = useDebouncedFetch(apiUrl, [queryString, isDesktop, page]);
  const { data: kpiData, loading: kpiLoading } = useDebouncedFetch(kpiUrl, [queryString]);
  const { data: filterOptions } = useFetch('/api/filter-options', []);

  // Sale data enrichment
  const [saleData, setSaleData] = useState({});
  const enrichSales = useCallback((listings) => {
    const missing = listings.filter(l => l.last_sale_price == null).map(l => l.id);
    if (missing.length === 0) return;
    fetch('/api/listings/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: missing }),
    })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        if (Object.keys(data).length > 0) {
          setSaleData(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (listingsData?.listings?.length) enrichSales(listingsData.listings);
  }, [listingsData]);

  const withSaleData = useCallback((listing) => {
    const sale = saleData[listing.id];
    if (!sale || listing.last_sale_price != null) return listing;
    return { ...listing, ...sale };
  }, [saleData]);

  // Mobile infinite scroll
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
        enrichSales(newItems);
        setHasMore(newItems.length >= 30);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [queryString, allListings.length, loadingMore, hasMore, isDesktop]);

  useEffect(() => {
    if (isDesktop) return;
    function onScroll() {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) {
        loadMore();
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loadMore, isDesktop]);

  const desktopListings = isDesktop ? (listingsData?.listings || []).map(withSaleData) : [];
  const total = listingsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / DESKTOP_PAGE_SIZE));

  const displayName = community.shortName || community.name;

  return (
    <div className={`min-h-screen bg-bg ${isDesktop ? 'pb-4' : 'pb-20'}`}>
      <SEO
        title={`${displayName} Property Price Drops — Dubai Deals`}
        description={community.description}
        canonical={`/area/${community.slug}/`}
        keywords={community.keywords}
      />
      <TopBar
        onFilterClick={() => setSheetOpen(true)}
        activeFilterCount={activeFilterCount}
        isDesktop={isDesktop}
      />

      {isDesktop ? (
        <div className="max-w-[1440px] mx-auto px-6 pt-4">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-white">{community.name} Price Drops</h1>
            <p className="text-sm text-muted mt-1">Properties with price reductions in {community.name}, updated daily.</p>
          </div>

          <SearchBar
            value={filters.search}
            onChange={v => setFilter('search', v)}
            activeCommunities={filters.communities}
            activeBuildings={filters.buildings}
            onSelectCommunity={() => {}}
            onSelectBuilding={b => {
              const updated = filters.buildings.includes(b) ? filters.buildings : [...filters.buildings, b];
              setFilters({ buildings: updated, search: '' });
            }}
          />

          <KPICards data={kpiData} loading={kpiLoading} />

          <DesktopFilterBar
            filters={filters}
            setFilter={setFilter}
            setFilters={setFilters}
            filterOptions={filterOptions}
            resetFilters={resetFilters}
            activeFilterCount={activeFilterCount}
          />

          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">
              {total.toLocaleString()} results in {community.name}
            </span>
            <select
              value={filters.sort}
              onChange={e => setFilter('sort', e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-white outline-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {listingsError ? (
            <div className="py-12 text-center">
              <div className="text-muted mb-2">Couldn't load listings</div>
              <button onClick={() => window.location.reload()} className="bg-accent text-white px-4 py-2 rounded-xl text-sm">Retry</button>
            </div>
          ) : listingsLoading ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted animate-pulse">Loading listings...</div>
          ) : desktopListings.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-white font-medium mb-1">No listings match your filters</div>
              <div className="text-muted text-sm mb-4">Try adjusting your filters</div>
              <button onClick={resetFilters} className="bg-accent text-white px-4 py-2 rounded-xl text-sm">Reset filters</button>
            </div>
          ) : (
            <>
              <ListingsTable listings={desktopListings} sort={filters.sort} onSortChange={v => setFilter('sort', v)} />
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={DESKTOP_PAGE_SIZE} onPageChange={setPage} />
            </>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 pt-2 pb-1">
            <h1 className="text-base font-bold text-white">{community.name} Price Drops</h1>
          </div>

          <SearchBar
            value={filters.search}
            onChange={v => setFilter('search', v)}
            activeCommunities={filters.communities}
            activeBuildings={filters.buildings}
            onSelectCommunity={() => {}}
            onSelectBuilding={b => {
              const updated = filters.buildings.includes(b) ? filters.buildings : [...filters.buildings, b];
              setFilters({ buildings: updated, search: '' });
            }}
          />

          <KPICards data={kpiData} loading={kpiLoading} />

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

          <div className="px-4 pb-2">
            <span className="text-xs text-muted">
              {listingsData ? `${listingsData.total?.toLocaleString()} results` : ''}
            </span>
          </div>

          {listingsError ? (
            <div className="px-4 py-12 text-center">
              <div className="text-muted mb-2">Couldn't load listings</div>
              <button onClick={() => window.location.reload()} className="bg-accent text-white px-4 py-2 rounded-xl text-sm min-h-[44px]">Retry</button>
            </div>
          ) : listingsLoading ? (
            <SkeletonCards count={4} />
          ) : allListings.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="text-white font-medium mb-1">No listings match your filters</div>
              <div className="text-muted text-sm mb-4">Try adjusting your filters</div>
              <button onClick={resetFilters} className="bg-accent text-white px-4 py-2 rounded-xl text-sm min-h-[44px]">Reset filters</button>
            </div>
          ) : (
            <div className="px-4 flex flex-col gap-3">
              {allListings.map(l => {
                const enriched = withSaleData(l);
                return <ListingCard key={l.id} listing={enriched} bookmarked={isBookmarked(l.id)} onToggleBookmark={toggle} />;
              })}
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
