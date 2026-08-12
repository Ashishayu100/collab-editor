import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Toast as ToastData, useToastStore } from '../../stores/toastStore';

const TOAST_DURATION_MS = 4000;
/** Errors and warnings stay up longer — they're worth reading, not just glancing at. */
const TOAST_DURATION_MS_LONG = 6000;

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const STYLES = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  info: 'border-gray-200 bg-white text-gray-800',
} as const;

export function Toast({ toast }: { toast: ToastData }) {
  const removeToast = useToastStore((state) => state.removeToast);
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const duration = toast.type === 'error' || toast.type === 'warning' ? TOAST_DURATION_MS_LONG : TOAST_DURATION_MS;
    const timeout = setTimeout(() => removeToast(toast.id), duration);
    return () => clearTimeout(timeout);
  }, [toast.id, toast.type, removeToast]);

  return (
    <div
      role="status"
      className={cn(
        'fade-in flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-lg',
        STYLES[toast.type]
      )}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={() => removeToast(toast.id)}
        className="shrink-0 rounded p-0.5 text-current opacity-60 transition-opacity duration-150 hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
