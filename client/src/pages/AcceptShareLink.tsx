import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { sharingApi } from '../api/sharing';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/utils';

export default function AcceptShareLink() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !token) return;

    let cancelled = false;
    sharingApi
      .acceptShareLink(token)
      .then(({ data }) => {
        if (!cancelled) navigate(`/document/${data.documentId}`, { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, isAuthLoading, navigate]);

  if (!token) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-300" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(`/share/${token}`)}`} replace />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-gray-600">{error}</p>
        <Link to="/dashboard" className="font-medium text-primary hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 size={24} className="animate-spin text-gray-300" />
      <p className="text-sm text-gray-500">Joining document…</p>
    </div>
  );
}
