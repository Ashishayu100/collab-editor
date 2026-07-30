import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isConfirming = false,
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus the overlay when it opens so Escape is captured here via React's synthetic bubbling
  // and stopped before it reaches any page-level (window) keydown listener underneath —
  // e.g. DocumentEditor's Ctrl+Shift+H / Escape handler for the version history panel this
  // dialog is nested in. Without this, dismissing the dialog would also close that panel.
  useEffect(() => {
    if (isOpen) overlayRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 outline-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : undefined}
          >
            {isConfirming ? <Loader2 size={14} className="animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
