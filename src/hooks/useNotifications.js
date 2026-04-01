import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export default function useNotifications() {
  const { user, isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

  // Fetch count
  const fetchCount = useCallback(() => {
    if (!isAuthenticated || !user?.token) { setCount(0); return; }
    fetch('/api/notifications/count', { headers })
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setCount(d.count))
      .catch(() => {});
  }, [isAuthenticated, user?.token]);

  // Fetch count on mount + poll every 60s
  useEffect(() => {
    fetchCount();
    if (!isAuthenticated) return;
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [fetchCount, isAuthenticated]);

  // Fetch full notification list
  const fetchAll = useCallback(() => {
    if (!isAuthenticated || !user?.token) return;
    setLoading(true);
    fetch('/api/notifications', { headers })
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(d => { setNotifications(d.notifications); setCount(d.notifications.length); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, user?.token]);

  // Dismiss one
  const dismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setCount(prev => Math.max(0, prev - 1));
    fetch(`/api/notifications/${id}/dismiss`, { method: 'POST', headers }).catch(() => {});
  }, [user?.token]);

  // Dismiss all
  const dismissAll = useCallback(() => {
    setNotifications([]);
    setCount(0);
    fetch('/api/notifications/dismiss-all', { method: 'POST', headers }).catch(() => {});
  }, [user?.token]);

  return { count, notifications, loading, fetchAll, dismiss, dismissAll };
}
