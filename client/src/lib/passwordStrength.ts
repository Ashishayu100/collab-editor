export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

/** Heuristic strength meter for the signup form's visual indicator only — the actual
 *  requirements enforced on submit are in Signup.tsx's isPasswordValid. */
export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (password.length === 0) return { score: 0, label: '', color: 'bg-gray-200' };
  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 3) return { score, label: 'Medium', color: 'bg-yellow-500' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}
