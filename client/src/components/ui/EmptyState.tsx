import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    isLoading?: boolean;
  };
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-16 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
        <Icon className="text-primary" size={26} />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="max-w-xs text-sm text-gray-500">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.isLoading}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {action.label}
        </button>
      )}
      {children}
    </div>
  );
}
