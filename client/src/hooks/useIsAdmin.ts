import { useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { useAuth } from './useAuth';

/** Whether the current user passes the server's /api/admin gate — used to show/hide the admin
 *  nav link. Re-checked whenever the authenticated user changes (e.g. after login/logout). */
export function useIsAdmin(): boolean {
  const { isAuthenticated } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdmin(false);
      return;
    }
    adminApi
      .check()
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, [isAuthenticated]);

  return isAdmin;
}
