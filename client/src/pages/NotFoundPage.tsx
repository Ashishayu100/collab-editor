import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="mb-4 text-8xl font-bold text-gray-200">404</div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Page not found</h1>
      <p className="mb-6 max-w-md text-gray-500">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
      <Link
        to="/dashboard"
        className="inline-block rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-dark"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
