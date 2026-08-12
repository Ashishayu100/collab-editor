import { api } from './axios';

export interface TopActiveDocument {
  documentId: string;
  title: string;
  connectionCount: number;
  messageCount: number;
}

export interface RecentError {
  timestamp: string;
  type: string;
  message: string;
  documentId?: string;
}

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

  topActiveDocuments: TopActiveDocument[];
  recentErrors: RecentError[];
}

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

export interface DatabaseStats {
  totalUsers: number;
  totalDocuments: number;
  totalComments: number;
  totalCollaborators: number;
  totalVersions: number;
  usersLast24h: number;
  documentsLast24h: number;
}

export const adminApi = {
  check: () => api.get<{ isAdmin: boolean }>('/api/admin/check'),
  getMetrics: () => api.get<ServerMetrics>('/api/admin/metrics'),
  getMetricsHistory: () => api.get<MetricsDataPoint[]>('/api/admin/metrics/history'),
  getStats: () => api.get<DatabaseStats>('/api/admin/stats'),
};
