export type MetricCardStatus = 'healthy' | 'warning' | 'critical';
export type MetricTrend = 'up' | 'down' | 'stable';
export type MetricFormat = 'number' | 'ms' | 'mb' | 'rate';

interface MetricCardProps {
  label: string;
  value: number | string;
  trend?: MetricTrend;
  trendValue?: string;
  status?: MetricCardStatus;
  format?: MetricFormat;
}

const STATUS_STYLES: Record<MetricCardStatus, string> = {
  healthy: 'border-gray-800 bg-gray-900',
  warning: 'border-yellow-800 bg-yellow-950/40',
  critical: 'border-red-800 bg-red-950/40',
};

const TREND_ICONS: Record<MetricTrend, string> = { up: '▲', down: '▼', stable: '—' };
const TREND_COLORS: Record<MetricTrend, string> = {
  up: 'text-green-400',
  down: 'text-red-400',
  stable: 'text-gray-500',
};

function formatValue(value: number | string, format?: MetricFormat): string {
  if (typeof value === 'string') return value;
  switch (format) {
    case 'ms':
      return `${value.toFixed(1)} ms`;
    case 'mb':
      return `${value.toFixed(0)} MB`;
    case 'rate':
      return `${value.toFixed(1)}/s`;
    default:
      return value.toLocaleString();
  }
}

export function MetricCard({ label, value, trend, trendValue, status = 'healthy', format }: MetricCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${STATUS_STYLES[status]}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{formatValue(value, format)}</p>
      {trend && (
        <p className={`mt-1 text-xs ${TREND_COLORS[trend]}`}>
          {TREND_ICONS[trend]} {trendValue ?? ''}
        </p>
      )}
    </div>
  );
}
