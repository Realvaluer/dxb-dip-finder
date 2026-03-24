import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchKpis } from '../api/client';

export default function useKpis() {
  const [searchParams] = useSearchParams();
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setLoading(true);
      const params = {
        min_dip: searchParams.get('min_dip') || undefined,
        bedrooms: searchParams.get('bedrooms') || undefined,
        communities: searchParams.get('communities') || undefined,
        buildings: searchParams.get('buildings') || undefined,
        source: searchParams.get('source') || undefined,
        property_type: searchParams.get('property_type') || undefined,
        listing_type: searchParams.get('listing_type') || undefined,
        max_price: searchParams.get('max_price') || undefined,
        min_sqft: searchParams.get('min_sqft') || undefined,
      };

      fetchKpis(params)
        .then(data => { setKpis(data); setLoading(false); })
        .catch(() => setLoading(false));
    }, 300);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [searchParams]);

  return { kpis, loading };
}
