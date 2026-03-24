import { Routes, Route } from 'react-router-dom';
import FeedPage from './pages/FeedPage';
import DetailPage from './pages/DetailPage';

export default function App() {
  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/listing/:id" element={<DetailPage />} />
      </Routes>
    </div>
  );
}
