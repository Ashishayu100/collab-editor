/**
 * In-memory server metrics singleton — connection/message counters, rolling latency averages,
 * and per-document activity, exposed via GET /api/admin/metrics. No external metrics system
 * (Prometheus/Grafana) is used; a single process's counters are all that's needed at this scale,
 * and the shape here is close enough to a Prometheus exposition that swapping one in later
 * wouldn't require touching any call site.
 */
export interface ServerMetrics {
  activeConnections: number;
  activeRooms: number;
  activeUsers: number;
  memoryUsageMB: number;

  totalConnectionsOpened: number;
  totalConnectionsClosed: number;
  totalMessagesReceived: number;
  totalMessagesSent: number;
  totalYjsSyncMessages: number;
  totalAwarenessMessages: number;
  totalCommentEvents: number;
  totalDocumentSaves: number;
  totalDocumentLoads: number;
  totalApiRequests: number;
  totalApiErrors: number;
  totalRateLimitHits: number;
  totalAuthFailures: number;

  avgMessageLatencyMs: number;
  avgApiResponseTimeMs: number;
  avgDocumentSaveTimeMs: number;

  messagesPerSecond: number;
  connectionsPerMinute: number;
  savesPerMinute: number;

  uptimeSeconds: number;
  nodeVersion: string;
  serverId: string;

  topActiveDocuments: Array<{
    documentId: string;
    title: string;
    connectionCount: number;
    messageCount: number;
  }>;

  recentErrors: Array<{
    timestamp: string;
    type: string;
    message: string;
    documentId?: string;
  }>;
}

interface RateWindow {
  count: number;
  startTime: number;
}

export class MetricsService {
  private static instance: MetricsService;

  private _activeConnections = 0;
  private _activeRooms = 0;
  private _activeUserIds = new Set<string>();

  private _totalConnectionsOpened = 0;
  private _totalConnectionsClosed = 0;
  private _totalMessagesReceived = 0;
  private _totalMessagesSent = 0;
  private _totalYjsSyncMessages = 0;
  private _totalAwarenessMessages = 0;
  private _totalCommentEvents = 0;
  private _totalDocumentSaves = 0;
  private _totalDocumentLoads = 0;
  private _totalApiRequests = 0;
  private _totalApiErrors = 0;
  private _totalRateLimitHits = 0;
  private _totalAuthFailures = 0;

  private _messageLatencies: number[] = [];
  private _apiResponseTimes: number[] = [];
  private _documentSaveTimes: number[] = [];
  private readonly LATENCY_WINDOW = 100;

  private _messageCountWindow: RateWindow = { count: 0, startTime: Date.now() };
  private _connectionCountWindow: RateWindow = { count: 0, startTime: Date.now() };
  private _saveCountWindow: RateWindow = { count: 0, startTime: Date.now() };

  private _documentMessageCounts: Map<string, number> = new Map();
  private _documentTitles: Map<string, string> = new Map();
  private _documentConnectionCounts: Map<string, number> = new Map();

  private _recentErrors: Array<{ timestamp: string; type: string; message: string; documentId?: string }> = [];
  private readonly MAX_ERRORS = 50;

  private _serverId = '';
  private _startTime = Date.now();
  private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  setServerId(id: string): void {
    this._serverId = id;
  }

  // --- Gauges ---

  connectionOpened(userId: string, documentId: string, documentTitle?: string): void {
    this._activeConnections++;
    this._totalConnectionsOpened++;
    this._activeUserIds.add(userId);
    this._connectionCountWindow.count++;

    const current = this._documentConnectionCounts.get(documentId) ?? 0;
    this._documentConnectionCounts.set(documentId, current + 1);
    if (documentTitle) {
      this._documentTitles.set(documentId, documentTitle);
    }
  }

  connectionClosed(_userId: string, documentId: string): void {
    this._activeConnections = Math.max(0, this._activeConnections - 1);
    this._totalConnectionsClosed++;

    const current = this._documentConnectionCounts.get(documentId) ?? 1;
    if (current <= 1) {
      this._documentConnectionCounts.delete(documentId);
    } else {
      this._documentConnectionCounts.set(documentId, current - 1);
    }

    // _activeUserIds isn't pruned here — a user's other tabs/connections may still be open.
    // startPeriodicCleanup reconciles it against the real connected set.
  }

  roomCreated(): void {
    this._activeRooms++;
  }

  roomDestroyed(): void {
    this._activeRooms = Math.max(0, this._activeRooms - 1);
  }

  // --- Counters ---

  messageReceived(messageType: number, documentId: string): void {
    this._totalMessagesReceived++;
    this._messageCountWindow.count++;

    switch (messageType) {
      case 0:
        this._totalYjsSyncMessages++;
        break;
      case 1:
        this._totalAwarenessMessages++;
        break;
      default:
        break;
    }

    const current = this._documentMessageCounts.get(documentId) ?? 0;
    this._documentMessageCounts.set(documentId, current + 1);
  }

  messageSent(): void {
    this._totalMessagesSent++;
  }

  commentEventBroadcast(documentId: string): void {
    this._totalCommentEvents++;
    const current = this._documentMessageCounts.get(documentId) ?? 0;
    this._documentMessageCounts.set(documentId, current + 1);
  }

  documentSaved(): void {
    this._totalDocumentSaves++;
    this._saveCountWindow.count++;
  }

  documentLoaded(): void {
    this._totalDocumentLoads++;
  }

  apiRequest(): void {
    this._totalApiRequests++;
  }

  apiError(): void {
    this._totalApiErrors++;
  }

  rateLimitHit(): void {
    this._totalRateLimitHits++;
  }

  authFailure(): void {
    this._totalAuthFailures++;
  }

  // --- Latency ---

  recordMessageLatency(ms: number): void {
    this.pushSample(this._messageLatencies, ms);
  }

  recordApiResponseTime(ms: number): void {
    this.pushSample(this._apiResponseTimes, ms);
  }

  recordDocumentSaveTime(ms: number): void {
    this.pushSample(this._documentSaveTimes, ms);
  }

  private pushSample(arr: number[], value: number): void {
    arr.push(value);
    if (arr.length > this.LATENCY_WINDOW) {
      arr.shift();
    }
  }

  // --- Error log ---

  recordError(type: string, message: string, documentId?: string): void {
    this._recentErrors.unshift({ timestamp: new Date().toISOString(), type, message, documentId });
    if (this._recentErrors.length > this.MAX_ERRORS) {
      this._recentErrors.pop();
    }
  }

  // --- Computed ---

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /** Rolling rate over a window that resets every 60s so old bursts don't skew the current rate. */
  private calculateRate(window: RateWindow, perSeconds: number): number {
    const elapsed = (Date.now() - window.startTime) / 1000;
    if (elapsed < 1) return 0;
    const rate = (window.count / elapsed) * perSeconds;

    if (elapsed > 60) {
      window.count = 0;
      window.startTime = Date.now();
    }

    return Math.round(rate * 100) / 100;
  }

  private getTopDocuments(n: number): ServerMetrics['topActiveDocuments'] {
    return Array.from(this._documentConnectionCounts.entries())
      .map(([documentId, connectionCount]) => ({
        documentId,
        title: this._documentTitles.get(documentId) ?? 'Unknown',
        connectionCount,
        messageCount: this._documentMessageCounts.get(documentId) ?? 0,
      }))
      .sort((a, b) => b.connectionCount - a.connectionCount)
      .slice(0, n);
  }

  getSnapshot(): ServerMetrics {
    const mem = process.memoryUsage();

    return {
      activeConnections: this._activeConnections,
      activeRooms: this._activeRooms,
      activeUsers: this._activeUserIds.size,
      memoryUsageMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,

      totalConnectionsOpened: this._totalConnectionsOpened,
      totalConnectionsClosed: this._totalConnectionsClosed,
      totalMessagesReceived: this._totalMessagesReceived,
      totalMessagesSent: this._totalMessagesSent,
      totalYjsSyncMessages: this._totalYjsSyncMessages,
      totalAwarenessMessages: this._totalAwarenessMessages,
      totalCommentEvents: this._totalCommentEvents,
      totalDocumentSaves: this._totalDocumentSaves,
      totalDocumentLoads: this._totalDocumentLoads,
      totalApiRequests: this._totalApiRequests,
      totalApiErrors: this._totalApiErrors,
      totalRateLimitHits: this._totalRateLimitHits,
      totalAuthFailures: this._totalAuthFailures,

      avgMessageLatencyMs: Math.round(this.average(this._messageLatencies) * 100) / 100,
      avgApiResponseTimeMs: Math.round(this.average(this._apiResponseTimes) * 100) / 100,
      avgDocumentSaveTimeMs: Math.round(this.average(this._documentSaveTimes) * 100) / 100,

      messagesPerSecond: this.calculateRate(this._messageCountWindow, 1),
      connectionsPerMinute: this.calculateRate(this._connectionCountWindow, 60),
      savesPerMinute: this.calculateRate(this._saveCountWindow, 60),

      uptimeSeconds: Math.round((Date.now() - this._startTime) / 1000),
      nodeVersion: process.version,
      serverId: this._serverId,

      topActiveDocuments: this.getTopDocuments(5),
      recentErrors: this._recentErrors.slice(0, 20),
    };
  }

  /** Reconciles the active-user gauge and per-document message counters against live state every
   *  30s — connectionClosed can't safely drop a userId (another tab may still be open) or a
   *  document's message count (a fresh room may reuse the id), so this is what actually prunes
   *  users with zero remaining connections and documents with no live room left. */
  startPeriodicCleanup(getConnectedUserIds: () => Set<string>): void {
    if (this._cleanupInterval) return;

    this._cleanupInterval = setInterval(() => {
      this._activeUserIds = getConnectedUserIds();

      for (const docId of this._documentMessageCounts.keys()) {
        if (!this._documentConnectionCounts.has(docId)) {
          this._documentMessageCounts.delete(docId);
          this._documentTitles.delete(docId);
        }
      }
    }, 30000);
    this._cleanupInterval.unref?.();
  }

  stopPeriodicCleanup(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}
