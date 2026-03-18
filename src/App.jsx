import { Routes, Route } from 'react-router-dom';
import Feed from './pages/Feed';
import ListingDetail from './pages/ListingDetail';
import Saved from './pages/Saved';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Feed />} />
      <Route path="/listing/:id" element={<ListingDetail />} />
      <Route path="/saved" element={<Saved />} />
    </Routes>
  );
}
