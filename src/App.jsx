import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import AuthSheet from './components/AuthSheet';
import Feed from './pages/Feed';
import CommunityPage from './pages/CommunityPage';
import ListingDetail from './pages/ListingDetail';
import Saved from './pages/Saved';
import Profile from './pages/Profile';
import Matches from './pages/Matches';
import { initAnalytics, trackPageView } from './lib/analytics';

export default function App() {
  const location = useLocation();

  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { trackPageView(location.pathname); }, [location.pathname]);

  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/area/:slug" element={<CommunityPage />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/matches/:savedListingId" element={<Matches />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
      <AuthSheet />
    </AuthProvider>
  );
}
