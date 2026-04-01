import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import useBookmarks from '../hooks/useBookmarks';
import SEO from '../components/SEO';
import ListingCard from '../components/ListingCard';
import BottomNav from '../components/BottomNav';
import { SkeletonCards } from '../components/Skeleton';

export default function Matches() {
  const { savedListingId } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { toggle, isBookmarked } = useBookmarks();
  const [listings, setListings] = useState([]);
  const [criteria, setCriteria] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.token) { setLoading(false); return; }
    fetch(`/api/matches/${savedListingId}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setListings(d.listings || []); setCriteria(d.criteria || null); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [savedListingId, isAuthenticated, user?.token]);

  const beds = criteria?.bedrooms === 0 ? 'Studio' : criteria?.bedrooms ? `${criteria.bedrooms}BR` : '';
  const title = criteria ? `${criteria.property_name} ${beds}` : 'Matching Listings';

  return (
    <div className="min-h-screen bg-bg pb-20">
      <SEO title={title} description="Matching listings for your saved property." noindex={true} />
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3 border-b border-border">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-accent text-sm min-h-[44px]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          {criteria?.community && <div className="text-[11px] text-muted truncate">{criteria.community}</div>}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <SkeletonCards count={3} />
        ) : error ? (
          <div className="text-center pt-12">
            <div className="text-muted mb-2">Couldn't load matches</div>
            <button onClick={() => navigate(-1)} className="bg-accent text-white px-4 py-2 rounded-xl text-sm min-h-[44px]">Go back</button>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center pt-12">
            <div className="text-white font-medium mb-1">No matching listings found</div>
            <div className="text-muted text-sm">We'll notify you when new ones appear</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {listings.map(l => (
              <ListingCard key={l.id} listing={l} bookmarked={isBookmarked(l.id)} onToggleBookmark={toggle} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
