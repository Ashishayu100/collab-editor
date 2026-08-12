import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/utils';
import { getPasswordStrength } from '../lib/passwordStrength';

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const PASSWORD_RULES_MESSAGE =
  'Password must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, and 1 number';

function isPasswordValid(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  const segments = 5;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-150 ${i < score ? color : 'bg-gray-200'}`}
          />
        ))}
      </div>
      <span className="w-12 shrink-0 text-right text-[11px] font-medium text-gray-500">{label}</span>
    </div>
  );
}

export default function Signup() {
  const { signup, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (name.trim().length < 2) {
      nextErrors.name = 'Name must be at least 2 characters';
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (!isPasswordValid(password)) {
      nextErrors.password = PASSWORD_RULES_MESSAGE;
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = 'Passwords do not match';
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
      await signup(email, name, password);
      navigate('/dashboard');
    } catch (error) {
      setApiError(getErrorMessage(error));
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
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
          aria-hidden
        />
        <span className="relative text-lg font-semibold">CollabEdit</span>
        <div className="relative">
          <p className="text-3xl font-bold leading-tight">
            Your next document,
            <br />
            written together.
          </p>
          <p className="mt-4 max-w-sm text-sm text-blue-100">
            Create a free account and start collaborating in real time — no credit card required.
          </p>
        </div>
        <span className="relative text-xs text-blue-200">© {new Date().getFullYear()} CollabEdit</span>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-[380px]">
          <span className="mb-8 block text-lg font-semibold text-gray-900 lg:hidden">CollabEdit</span>
          <h1 className="mb-6 text-2xl font-semibold text-gray-900">Create your account</h1>

          {apiError && (
            <div className="mb-4 animate-fade-in rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{apiError}</div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              id="name"
              type="text"
              label="Name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              autoComplete="name"
            />
            <Input
              id="email"
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <div className="flex flex-col gap-1.5">
              <PasswordInput
                id="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                autoComplete="new-password"
              />
              {!errors.password && <PasswordStrengthMeter password={password} />}
              {!errors.password && <p className="text-xs text-gray-400">At least 8 characters, 1 uppercase, 1 number</p>}
            </div>
            <PasswordInput
              id="confirmPassword"
              label="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
            <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting} className="mt-2 w-full">
              Sign up →
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
