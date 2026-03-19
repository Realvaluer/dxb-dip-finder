import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export default function useBookmarks() {
  const { user, isAuthenticated, openAuth } = useAuth();
  const [savedIds, setSavedIds] = useState(new Set());

  // Fetch saved IDs on auth change
  useEffect(() => {
    if (!isAuthenticated || !user?.token) { setSavedIds(new Set()); return; }
    fetch('/api/saved/ids', { headers: { Authorization: `Bearer ${user.token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(ids => setSavedIds(new Set(ids)))
      .catch(() => {});
  }, [isAuthenticated, user?.token]);

  const toggle = useCallback((id) => {
    if (!isAuthenticated) {
      // Open auth sheet, after login the save will happen
      openAuth((session) => {
        fetch(`/api/saved/${id}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        }).then(() => setSavedIds(prev => new Set([...prev, id])));
      });
      return;
    }

    const isSaved = savedIds.has(id);
    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev);
      if (isSaved) next.delete(id); else next.add(id);
      return next;
    });

    fetch(`/api/saved/${id}`, {
      method: isSaved ? 'DELETE' : 'POST',
      headers: { Authorization: `Bearer ${user.token}` },
    }).catch(() => {
      // Revert on error
      setSavedIds(prev => {
        const next = new Set(prev);
        if (isSaved) next.add(id); else next.delete(id);
        return next;
      });
    });
  }, [isAuthenticated, user, savedIds, openAuth]);

  const isBookmarked = useCallback((id) => savedIds.has(id), [savedIds]);

  return { bookmarks: [...savedIds], toggle, isBookmarked };
}
