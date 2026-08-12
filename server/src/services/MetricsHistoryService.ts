import { MetricsService } from './MetricsService';

export interface MetricsDataPoint {
  timestamp: string;
  activeConnections: number;
  activeRooms: number;
  activeUsers: number;
  messagesPerSecond: number;
  savesPerMinute: number;
  avgApiResponseTimeMs: number;
  avgMessageLatencyMs: number;
  memoryUsageMB: number;
  totalApiErrors: number;
  totalRateLimitHits: number;
}

/** Collects one MetricsService snapshot per minute so the admin dashboard can chart trends —
 *  MetricsService itself only ever exposes the current instant. */
export class MetricsHistoryService {
  private static instance: MetricsHistoryService;
  private history: MetricsDataPoint[] = [];
  private readonly MAX_POINTS = 60; // 1 hour of minute-by-minute data
  private interval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): MetricsHistoryService {
    if (!MetricsHistoryService.instance) {
      MetricsHistoryService.instance = new MetricsHistoryService();
    }
    return MetricsHistoryService.instance;
  }

  start(): void {
    if (this.interval) return;

    this.collectDataPoint();
    this.interval = setInterval(() => this.collectDataPoint(), 60000);
    this.interval.unref?.();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private collectDataPoint(): void {
    const snapshot = MetricsService.getInstance().getSnapshot();

    this.history.push({
      timestamp: new Date().toISOString(),
      activeConnections: snapshot.activeConnections,
      activeRooms: snapshot.activeRooms,
      activeUsers: snapshot.activeUsers,
      messagesPerSecond: snapshot.messagesPerSecond,
      savesPerMinute: snapshot.savesPerMinute,
      avgApiResponseTimeMs: snapshot.avgApiResponseTimeMs,
      avgMessageLatencyMs: snapshot.avgMessageLatencyMs,
      memoryUsageMB: snapshot.memoryUsageMB,
      totalApiErrors: snapshot.totalApiErrors,
      totalRateLimitHits: snapshot.totalRateLimitHits,
    });

    if (this.history.length > this.MAX_POINTS) {
      this.history.shift();
    }
  }

  getHistory(): MetricsDataPoint[] {
    return [...this.history];
  }
}
