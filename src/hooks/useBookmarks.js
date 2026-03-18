import { useState, useCallback } from 'react';

const STORAGE_KEY = 'dip_finder_bookmarks';

function getStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

export default function useBookmarks() {
  const [bookmarks, setBookmarks] = useState(getStored);

  const toggle = useCallback((id) => {
    setBookmarks(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isBookmarked = useCallback((id) => bookmarks.includes(id), [bookmarks]);

  return { bookmarks, toggle, isBookmarked };
}
