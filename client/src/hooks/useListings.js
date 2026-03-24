import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchListings } from '../api/client';

export default function useListings() {
  const [searchParams] = useSearchParams();
  const [listings, setListings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const getParams = useCallback(() => ({
    min_dip: searchParams.get('min_dip') || undefined,
    bedrooms: searchParams.get('bedrooms') || undefined,
    area: searchParams.get('area') || undefined,
    communities: searchParams.get('communities') || undefined,
    buildings: searchParams.get('buildings') || undefined,
    source: searchParams.get('source') || undefined,
    search: searchParams.get('search') || undefined,
    sort: searchParams.get('sort') || 'dip_pct',
    max_price: searchParams.get('max_price') || undefined,
    min_sqft: searchParams.get('min_sqft') || undefined,
    property_type: searchParams.get('property_type') || undefined,
    listing_type: searchParams.get('listing_type') || undefined,
    limit: LIMIT,
    offset: 0,
  }), [searchParams]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOffset(0);

    fetchListings(getParams())
      .then(res => {
        if (cancelled) return;
        setListings(res.data);
        setTotal(res.total);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [getParams]);

  const loadMore = useCallback(() => {
    if (loadingMore || listings.length >= total) return;
    const newOffset = offset + LIMIT;
    setLoadingMore(true);

    fetchListings({ ...getParams(), offset: newOffset })
      .then(res => {
        setListings(prev => [...prev, ...res.data]);
        setOffset(newOffset);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [loadingMore, listings.length, total, offset, getParams]);

  return {
    listings,
    total,
    loading,
    loadingMore,
    error,
    hasMore: listings.length < total,
    loadMore,
  };
}
