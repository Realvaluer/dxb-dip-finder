import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import AuthSheet from './components/AuthSheet';
import Feed from './pages/Feed';
import ListingDetail from './pages/ListingDetail';
import Saved from './pages/Saved';
import Profile from './pages/Profile';
import { initAnalytics, trackPageView } from './lib/analytics';

export default function App() {
  const location = useLocation();

  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { trackPageView(location.pathname); }, [location.pathname]);

  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/listing/:id" element={<ListingDetail />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
      <AuthSheet />
    </AuthProvider>
  );
}
