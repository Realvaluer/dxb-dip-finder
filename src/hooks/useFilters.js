import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';

export default function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => ({
    search: searchParams.get('search') || '',
    purpose: searchParams.get('purpose') || '',
    sort: searchParams.get('sort') || 'newest',
    type: searchParams.get('type') || '',
    source: searchParams.get('source') || '',
    bedrooms: searchParams.get('bedrooms') || '',
    min_dip: searchParams.get('min_dip') || '0',
    max_price: searchParams.get('max_price') || '',
    min_sqft: searchParams.get('min_sqft') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    communities: searchParams.getAll('community[]'),
    buildings: searchParams.getAll('property_name[]'),
  }), [searchParams]);

  const applyFilterUpdates = useCallback((updates) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'communities') {
          next.delete('community[]');
          (value || []).forEach(v => next.append('community[]', v));
        } else if (key === 'buildings') {
          next.delete('property_name[]');
          (value || []).forEach(v => next.append('property_name[]', v));
        } else if (!value && value !== 0) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      next.delete('offset');
      return next;
    });
  }, [setSearchParams]);

  const setFilter = useCallback((key, value) => {
    applyFilterUpdates({ [key]: value });
  }, [applyFilterUpdates]);

  const resetFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.purpose) count++;
    if (filters.type) count++;
    if (filters.source) count++;
    if (filters.bedrooms) count++;
    if (parseFloat(filters.min_dip) > 0) count++;
    if (filters.max_price) count++;
    if (filters.min_sqft) count++;
    if (filters.date_from || filters.date_to) count++;
    if (filters.communities.length) count++;
    if (filters.buildings.length) count++;
    return count;
  }, [filters]);

  const queryString = useMemo(() => {
    return searchParams.toString();
  }, [searchParams]);

  return { filters, setFilter, setFilters: applyFilterUpdates, resetFilters, activeFilterCount, queryString };
}
