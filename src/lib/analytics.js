// Analytics SDK — silently tracks user interactions, never throws

let sessionStart = null;
let initialized = false;

function uuid() {
  return crypto.randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

function getSessionId() {
  let sid = sessionStorage.getItem('ddp_sid');
  if (!sid) {
    sid = uuid();
    sessionStorage.setItem('ddp_sid', sid);
  }
  return sid;
}

function getUserEmail() {
  try {
    const raw = localStorage.getItem('ddp_user');
    if (!raw) return null;
    return JSON.parse(raw).email || null;
  } catch {
    return null;
  }
}

async function send(eventType, payload = {}) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_type: eventType,
        session_id: getSessionId(),
        user_email: getUserEmail(),
        page: window.location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        ...payload,
      }),
    });
  } catch {
    // silently swallow all errors
  }
}

export function initAnalytics() {
  if (initialized) return;
  initialized = true;
  sessionStart = Date.now();

  window.addEventListener('beforeunload', () => {
    send('session_end', { duration_ms: Date.now() - sessionStart });
  });

  trackPageView();
}

export function trackPageView(page) {
  send('pageview', { page: page || window.location.pathname });
}

export function trackFilter(filterValues) {
  send('filter', { event_data: filterValues });
}

export function trackClick(buttonName, extra = {}) {
  send('click', { event_data: { button: buttonName, ...extra } });
}

export function trackPropertyView(propertyId, propertyName) {
  send('property_view', {
    property_id: propertyId,
    property_name: propertyName,
  });
}

export function identifyUser(email) {
  try {
    localStorage.setItem('ddp_user', JSON.stringify({ email }));
  } catch {
    // silently swallow
  }
}
