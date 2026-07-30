import { api } from './axios';

export interface VersionCreator {
  id: string;
  name: string;
  avatarColor: string;
}

export interface VersionSummary {
  id: string;
  versionNum: number;
  title: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: VersionCreator;
}

export interface VersionDetail extends VersionSummary {
  /** Base64-encoded Yjs state (Y.encodeStateAsUpdate). */
  content: string;
}

export interface ListVersionsResult {
  versions: VersionSummary[];
  nextCursor: string | null;
}

export const versionApi = {
  list: (documentId: string, params?: { limit?: number; cursor?: string }) =>
    api.get<ListVersionsResult>(`/api/documents/${documentId}/versions`, { params }),
  get: (documentId: string, versionId: string) =>
    api.get<{ version: VersionDetail }>(`/api/documents/${documentId}/versions/${versionId}`),
  create: (documentId: string) =>
    api.post<{ version: VersionSummary }>(`/api/documents/${documentId}/versions`),
  restore: (documentId: string, versionId: string) =>
    api.post<{ version: VersionSummary }>(`/api/documents/${documentId}/versions/${versionId}/restore`),
};
