import { ArrowLeft, FileText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { adminApi, DatabaseStats, MetricsDataPoint, RecentError, ServerMetrics } from '../api/admin';
import { api } from '../api/axios';
import { MetricCard, MetricTrend } from '../components/admin/MetricCard';
import { getErrorMessage } from '../lib/utils';
import { useToastStore } from '../stores/toastStore';

const METRICS_REFRESH_INTERVAL = 5000;
const STATS_REFRESH_INTERVAL = 30000;
const TREND_LOOKBACK_MINUTES = 5;

interface HealthStatus {
  status: string;
  redis: string;
  database: string;
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatRelativeTime(isoTimestamp: string): string {
  const seconds = Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function trendFrom(current: number, past: number | undefined): { trend: MetricTrend; trendValue: string } {
  if (past === undefined) return { trend: 'stable', trendValue: '' };
  if (past === 0) {
    return current > 0 ? { trend: 'up', trendValue: 'new activity' } : { trend: 'stable', trendValue: 'stable' };
  }
  const change = ((current - past) / past) * 100;
  if (Math.abs(change) < 1) return { trend: 'stable', trendValue: 'stable' };
  return { trend: change > 0 ? 'up' : 'down', trendValue: `${change > 0 ? '+' : ''}${change.toFixed(0)}%` };
}

const ERROR_TYPE_STYLES: Record<string, string> = {
  websocket: 'bg-blue-950 text-blue-300',
  database: 'bg-purple-950 text-purple-300',
  'websocket-auth': 'bg-orange-950 text-orange-300',
  api: 'bg-teal-950 text-teal-300',
};

function ErrorTypeBadge({ type }: { type: string }) {
  const style = ERROR_TYPE_STYLES[type] ?? 'bg-gray-800 text-gray-300';
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style}`}>{type}</span>;
}

function RecentErrorRow({ error }: { error: RecentError }) {
  const isRecent = Date.now() - new Date(error.timestamp).getTime() < 5 * 60 * 1000;
  return (
    <div className={`rounded-lg border p-3 ${isRecent ? 'border-red-900 bg-red-950/30' : 'border-gray-800 bg-gray-900/50 opacity-60'}`}>
      <div className="flex items-center justify-between gap-2">
        <ErrorTypeBadge type={error.type} />
        <span className="shrink-0 text-[10px] text-gray-500">{formatRelativeTime(error.timestamp)}</span>
      </div>
      <p className="mt-1.5 break-words text-xs text-gray-300">{error.message}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [accessState, setAccessState] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [history, setHistory] = useState<MetricsDataPoint[]>([]);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const prevApiRequests = useRef<{ total: number; at: number } | null>(null);
  const [apiRequestsPerMinute, setApiRequestsPerMinute] = useState(0);

  useEffect(() => {
    adminApi
      .check()
      .then(() => setAccessState('granted'))
      .catch(() => {
        setAccessState('denied');
        addToast('Admin access required', 'error');
        navigate('/dashboard', { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const [metricsRes, historyRes, healthRes] = await Promise.all([
        adminApi.getMetrics(),
        adminApi.getMetricsHistory(),
        api.get<HealthStatus>('/api/health'),
      ]);

      const nextMetrics = metricsRes.data;
      const now = Date.now();
      const prev = prevApiRequests.current;
      if (prev && now > prev.at) {
        const rate = ((nextMetrics.totalApiRequests - prev.total) / ((now - prev.at) / 1000)) * 60;
        setApiRequestsPerMinute(Math.max(0, Math.round(rate)));
      }
      prevApiRequests.current = { total: nextMetrics.totalApiRequests, at: now };

      setMetrics(nextMetrics);
      setHistory(historyRes.data);
      setHealth(healthRes.data);
      setFetchError(null);
    } catch (err) {
      setFetchError(getErrorMessage(err));
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await adminApi.getStats();
      setStats(data);
    } catch {
      // Non-critical panel — the rest of the dashboard still functions without it.
    }
  }, []);

  useEffect(() => {
    if (accessState !== 'granted' || !isLive) return undefined;

    void fetchMetrics();
    const interval = setInterval(() => void fetchMetrics(), METRICS_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [accessState, isLive, fetchMetrics]);

  useEffect(() => {
    if (accessState !== 'granted') return undefined;

    void fetchStats();
    const interval = setInterval(() => void fetchStats(), STATS_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [accessState, fetchStats]);

  if (accessState !== 'granted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-gray-300" />
      </div>
    );
  }

  const pastPoint = history[Math.max(0, history.length - 1 - TREND_LOOKBACK_MINUTES)];

  const connectionsTrend = metrics ? trendFrom(metrics.activeConnections, pastPoint?.activeConnections) : null;
  const roomsTrend = metrics ? trendFrom(metrics.activeRooms, pastPoint?.activeRooms) : null;
  const usersTrend = metrics ? trendFrom(metrics.activeUsers, pastPoint?.activeUsers) : null;
  const throughputTrend = metrics ? trendFrom(metrics.messagesPerSecond, pastPoint?.messagesPerSecond) : null;
  const memoryTrend = metrics ? trendFrom(metrics.memoryUsageMB, pastPoint?.memoryUsageMB) : null;
  const latencyTrend = metrics ? trendFrom(metrics.avgMessageLatencyMs, pastPoint?.avgMessageLatencyMs) : null;
  const errorsTrend = metrics ? trendFrom(metrics.totalApiErrors, pastPoint?.totalApiErrors) : null;

  const chartData = history.map((point) => ({
    ...point,
    time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
            >
              <ArrowLeft size={14} /> Back to dashboard
            </button>
            <h1 className="text-2xl font-bold text-white">System Monitor</h1>
            <p className="text-sm text-gray-400">
              Server: <span className="font-mono text-gray-300">{metrics?.serverId ?? '—'}</span> · Uptime:{' '}
              {formatUptime(metrics?.uptimeSeconds)} · Node {metrics?.nodeVersion ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {fetchError && <span className="text-xs text-red-400">{fetchError}</span>}
            <span className={`h-2 w-2 rounded-full ${isLive ? 'animate-pulse bg-green-500' : 'bg-gray-500'}`} />
            <button
              type="button"
              onClick={() => setIsLive((v) => !v)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                isLive ? 'bg-green-900 text-green-300 hover:bg-green-800' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {isLive ? 'Live' : 'Paused'}
            </button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="Connections"
            value={metrics?.activeConnections ?? 0}
            trend={connectionsTrend?.trend}
            trendValue={connectionsTrend?.trendValue}
            status={metrics && metrics.activeConnections > 1000 ? 'warning' : 'healthy'}
          />
          <MetricCard
            label="Active Rooms"
            value={metrics?.activeRooms ?? 0}
            trend={roomsTrend?.trend}
            trendValue={roomsTrend?.trendValue}
          />
          <MetricCard
            label="Active Users"
            value={metrics?.activeUsers ?? 0}
            trend={usersTrend?.trend}
            trendValue={usersTrend?.trendValue}
          />
          <MetricCard
            label="Messages/s"
            value={metrics?.messagesPerSecond ?? 0}
            format="rate"
            trend={throughputTrend?.trend}
            trendValue={throughputTrend?.trendValue}
          />
          <MetricCard label="API Req/min" value={apiRequestsPerMinute} />
          <MetricCard
            label="Avg Latency"
            value={metrics?.avgMessageLatencyMs ?? 0}
            format="ms"
            trend={latencyTrend?.trend}
            trendValue={latencyTrend?.trendValue}
            status={
              metrics && metrics.avgMessageLatencyMs > 200
                ? 'critical'
                : metrics && metrics.avgMessageLatencyMs > 50
                  ? 'warning'
                  : 'healthy'
            }
          />
          <MetricCard
            label="Memory"
            value={metrics?.memoryUsageMB ?? 0}
            format="mb"
            trend={memoryTrend?.trend}
            trendValue={memoryTrend?.trendValue}
            status={
              metrics && metrics.memoryUsageMB > 800 ? 'critical' : metrics && metrics.memoryUsageMB > 500 ? 'warning' : 'healthy'
            }
          />
          <MetricCard
            label="Errors"
            value={metrics?.totalApiErrors ?? 0}
            trend={errorsTrend?.trend}
            trendValue={errorsTrend?.trendValue}
            status={errorsTrend?.trend === 'up' ? 'warning' : 'healthy'}
          />
        </div>

        {/* Charts */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="mb-4 text-sm font-medium text-gray-400">Connections &amp; Users</h3>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={12} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Line type="monotone" dataKey="activeConnections" name="Connections" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activeUsers" name="Users" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="mb-4 text-sm font-medium text-gray-400">Throughput &amp; Latency</h3>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={12} tickLine={false} />
                <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="messagesPerSecond"
                  name="Msgs/s"
                  fill="#3b82f6"
                  fillOpacity={0.15}
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgMessageLatencyMs"
                  name="Latency (ms)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottom panels */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="mb-4 text-sm font-medium text-gray-400">Top Active Documents</h3>
            {!metrics || metrics.topActiveDocuments.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No documents currently open.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Document</th>
                      <th className="py-2 pr-3 font-medium">Connections</th>
                      <th className="py-2 pr-3 font-medium">Messages</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topActiveDocuments.map((doc, i) => (
                      <tr key={doc.documentId} className="border-b border-gray-800/60 last:border-0">
                        <td className="py-2.5 pr-3 text-gray-500">{i + 1}</td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/document/${doc.documentId}`)}
                            className="inline-flex items-center gap-1.5 text-gray-200 hover:text-blue-400"
                          >
                            <FileText size={14} className="shrink-0 text-gray-500" />
                            <span className="truncate">{doc.title}</span>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 text-gray-300">{doc.connectionCount}</td>
                        <td className="py-2.5 pr-3 text-gray-300">{doc.messageCount.toLocaleString()}</td>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="mb-4 text-sm font-medium text-gray-400">System Info</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Server ID</dt>
                <dd className="truncate font-mono text-xs text-gray-300">{metrics?.serverId ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Uptime</dt>
                <dd className="text-gray-300">{formatUptime(metrics?.uptimeSeconds)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Node.js</dt>
                <dd className="text-gray-300">{metrics?.nodeVersion ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Redis</dt>
                <dd className={health?.redis === 'connected' ? 'text-green-400' : 'text-red-400'}>
                  {health?.redis ?? 'unknown'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Database</dt>
                <dd className={health?.database === 'connected' ? 'text-green-400' : 'text-red-400'}>
                  {health?.database ?? 'unknown'}
                </dd>
              </div>
              <div className="my-3 border-t border-gray-800" />
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Total Users</dt>
                <dd className="text-gray-300">
                  {stats?.totalUsers ?? '—'}
                  {stats && <span className="ml-1 text-xs text-gray-500">(+{stats.usersLast24h} today)</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Total Documents</dt>
                <dd className="text-gray-300">
                  {stats?.totalDocuments ?? '—'}
                  {stats && <span className="ml-1 text-xs text-gray-500">(+{stats.documentsLast24h} today)</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Comments</dt>
                <dd className="text-gray-300">{stats?.totalComments ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Versions</dt>
                <dd className="text-gray-300">{stats?.totalVersions ?? '—'}</dd>
              </div>
            </dl>

            <h3 className="mb-3 mt-6 text-sm font-medium text-gray-400">Recent Errors</h3>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {!metrics || metrics.recentErrors.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-500">No errors recorded.</p>
              ) : (
                metrics.recentErrors.map((error, i) => <RecentErrorRow key={`${error.timestamp}-${i}`} error={error} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
