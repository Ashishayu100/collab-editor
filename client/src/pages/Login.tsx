import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../hooks/useAuth';

interface FormErrors {
  email?: string;
  password?: string;
}

/** Only ever redirect to a path within this app — never follow an absolute/external URL. */
function sanitizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (password.length === 0) {
      nextErrors.password = 'Password is required';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate(returnTo);
    } catch {
      // Deliberately generic — don't reveal whether the email or the password was wrong.
      setApiError('Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Decorative panel — hidden on mobile */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden
        />
        <span className="relative text-lg font-semibold">CollabEdit</span>
        <div className="relative">
          <p className="text-3xl font-bold leading-tight">
            Write together.
            <br />
            Think together.
            <br />
            Build together.
          </p>
          <p className="mt-4 max-w-sm text-sm text-blue-100">
            Real-time collaborative editing with conflict-free CRDTs, comments, and version
            history — all in one place.
          </p>
        </div>
        <span className="relative text-xs text-blue-200">© {new Date().getFullYear()} CollabEdit</span>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-[380px]">
          <span className="mb-8 block text-lg font-semibold text-gray-900 lg:hidden">CollabEdit</span>
          <h1 className="mb-6 text-2xl font-semibold text-gray-900">Welcome back</h1>

          {apiError && (
            <div className="mb-4 animate-fade-in rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{apiError}</div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              id="email"
              type="email"
              label="Email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <PasswordInput
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoComplete="current-password"
            />
            <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="mt-2 w-full">
              Log in →
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
