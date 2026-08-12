import { Activity } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { Button } from './ui/Button';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const isAdmin = useIsAdmin();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-gray-900">CollabEdit</span>
          {user && (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <Activity size={16} />
                  Monitor
                </Link>
              )}
              <span
                className="h-7 w-7 rounded-full"
                style={{ backgroundColor: user.avatarColor }}
                aria-hidden
              />
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
              <Button variant="secondary" onClick={() => void logout()}>
                Logout
              </Button>
            </div>
          )}
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
