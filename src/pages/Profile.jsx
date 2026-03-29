import { useAuth } from '../hooks/useAuth';
import SEO from '../components/SEO';
import BottomNav from '../components/BottomNav';
import { formatDate } from '../utils';

export default function Profile() {
  const { user, isAuthenticated, logout, openAuth } = useAuth();

  return (
    <div className="min-h-screen bg-bg pb-20">
      <SEO title="Profile" description="Your DXB Dip Finder profile." noindex={true} />
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm px-4 py-3 border-b border-border">
        <h1 className="text-lg font-bold">Profile</h1>
      </div>

      <div className="px-4 pt-8">
        {isAuthenticated ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-white font-medium">{user.email}</div>
            <div className="text-muted text-sm mt-1">Member</div>
            <button
              onClick={logout}
              className="mt-8 bg-card border border-border text-muted px-6 py-2.5 rounded-xl text-sm min-h-[44px]"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="text-center pt-8">
            <div className="text-white font-medium mb-2">Sign in to save listings and get alerts</div>
            <button
              onClick={() => openAuth()}
              className="mt-4 bg-accent text-white px-6 py-2.5 rounded-xl text-sm font-semibold min-h-[44px]"
            >
              Sign in
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
