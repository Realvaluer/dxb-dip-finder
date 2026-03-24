import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import { fetchBuildings } from '../../api/client';

const SORT_OPTIONS = [
  { value: 'dip_pct', label: 'Biggest dip %' },
  { value: 'dip_aed', label: 'Biggest dip AED' },
  { value: 'newest', label: 'Most recently scraped' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

const LISTING_TYPES = ['Both', 'Sale', 'Rent'];
const BEDROOM_OPTIONS = ['Any', 'Studio', '1', '2', '3', '4+'];
const PROPERTY_TYPES = ['Any', 'Apartment', 'Villa', 'Townhouse', 'Penthouse'];
const SOURCES = ['All', 'Property Finder', 'Bayut', 'Dubizzle'];

export default function BottomSheet({ open, onClose, areas = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [buildings, setBuildings] = useState([]);

  // Parse current communities/buildings from URL
  const currentCommunities = searchParams.get('communities')?.split(',').filter(Boolean) || [];
  const currentBuildings = searchParams.get('buildings')?.split(',').filter(Boolean) || [];

  // Fetch buildings when communities change
  useEffect(() => {
    if (!open) return;
    fetchBuildings(currentCommunities).then(setBuildings).catch(() => setBuildings([]));
  }, [open, currentCommunities.join(',')]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const currentSort = searchParams.get('sort') || 'dip_pct';
  const currentListingType = searchParams.get('listing_type') || '';
  const currentBedrooms = searchParams.get('bedrooms') || '';
  const currentType = searchParams.get('property_type') || '';
  const currentSource = searchParams.get('source') || '';
  const currentMinDip = searchParams.get('min_dip') || '0';
  const currentMaxPrice = searchParams.get('max_price') || '';

  const apply = (updates) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === '' || v === undefined || v === 'Any' || v === 'All' || v === '0' || v === 'Both') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    setSearchParams(params);
  };

  const setCommunities = (vals) => {
    const params = new URLSearchParams(searchParams);
    if (vals.length > 0) {
      params.set('communities', vals.join(','));
    } else {
      params.delete('communities');
    }
    // Clear buildings if communities changed (buildings may no longer be valid)
    params.delete('buildings');
    setSearchParams(params);
  };

  const setBuildingsParam = (vals) => {
    const params = new URLSearchParams(searchParams);
    if (vals.length > 0) {
      params.set('buildings', vals.join(','));
    } else {
      params.delete('buildings');
    }
    setSearchParams(params);
  };

  const reset = () => {
    setSearchParams({});
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-brand-950 border-t border-brand-800 rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-200">Filter & Sort</h2>
            <button onClick={onClose} className="text-gray-500 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Sort */}
          <Section title="Sort by">
            <div className="flex flex-col gap-1">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => apply({ sort: opt.value })}
                  className={`text-left px-3 py-2 rounded-lg text-sm ${
                    currentSort === opt.value
                      ? 'bg-brand-700 text-brand-200'
                      : 'text-gray-400 hover:bg-brand-900/60'
                  }`}
                >
                  {currentSort === opt.value && '✓ '}{opt.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Listing Type */}
          <Section title="Listing type">
            <div className="flex gap-2 flex-wrap">
              {LISTING_TYPES.map(opt => {
                const val = opt === 'Both' ? '' : opt;
                return (
                  <button
                    key={opt}
                    onClick={() => apply({ listing_type: val })}
                    className={`chip ${currentListingType === val || (!currentListingType && opt === 'Both') ? 'chip-active' : 'chip-inactive'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Min Dip % */}
          <Section title={`Min dip %: ${currentMinDip}%`}>
            <input
              type="range"
              min="0" max="50" step="1"
              value={currentMinDip}
              onChange={(e) => apply({ min_dip: e.target.value })}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>0%</span><span>50%</span>
            </div>
          </Section>

          {/* Bedrooms */}
          <Section title="Bedrooms">
            <div className="flex gap-2 flex-wrap">
              {BEDROOM_OPTIONS.map(opt => {
                const val = opt === 'Any' ? '' : opt === 'Studio' ? '0' : opt === '4+' ? '4' : opt;
                return (
                  <button
                    key={opt}
                    onClick={() => apply({ bedrooms: val })}
                    className={`chip ${currentBedrooms === val || (!currentBedrooms && opt === 'Any') ? 'chip-active' : 'chip-inactive'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Community (searchable multi-select) */}
          <Section title="Community">
            <SearchableMultiSelect
              label="community"
              placeholder="All communities"
              options={areas}
              selected={currentCommunities}
              onChange={setCommunities}
            />
          </Section>

          {/* Building (searchable multi-select, scoped to communities) */}
          <Section title="Building">
            <SearchableMultiSelect
              label="building"
              placeholder="All buildings"
              options={buildings}
              selected={currentBuildings}
              onChange={setBuildingsParam}
            />
          </Section>

          {/* Property Type */}
          <Section title="Property type">
            <div className="flex gap-2 flex-wrap">
              {PROPERTY_TYPES.map(opt => {
                const val = opt === 'Any' ? '' : opt;
                return (
                  <button
                    key={opt}
                    onClick={() => apply({ property_type: val })}
                    className={`chip ${currentType === val || (!currentType && opt === 'Any') ? 'chip-active' : 'chip-inactive'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Source */}
          <Section title="Source">
            <div className="flex gap-2 flex-wrap">
              {SOURCES.map(opt => {
                const val = opt === 'All' ? '' : opt;
                return (
                  <button
                    key={opt}
                    onClick={() => apply({ source: val })}
                    className={`chip ${currentSource === val || (!currentSource && opt === 'All') ? 'chip-active' : 'chip-inactive'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Max Price */}
          <Section title="Max price">
            <input
              type="number"
              value={currentMaxPrice}
              onChange={(e) => apply({ max_price: e.target.value })}
              placeholder="e.g. 5000000"
              className="w-full bg-brand-900/60 border border-brand-800 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600"
            />
          </Section>

          {/* Actions */}
          <div className="flex gap-3 mt-4 pt-4 border-t border-brand-800">
            <button onClick={reset} className="flex-1 py-2.5 text-sm text-gray-400 border border-brand-800 rounded-lg">
              Reset
            </button>
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium bg-brand-700 text-brand-200 rounded-lg">
              Apply
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  );
}
