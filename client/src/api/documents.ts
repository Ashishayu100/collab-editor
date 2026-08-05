import { api } from './axios';

export type DocumentRole = 'VIEWER' | 'EDITOR' | 'OWNER';

export interface DocumentOwner {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
}

export interface DocumentCollaboratorSummary {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
}

export interface DocumentCollaboratorDetail extends DocumentCollaboratorSummary {
  role: DocumentRole;
  addedAt: string;
}

export interface ActiveUser {
  name: string;
  color: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFolderRef {
  id: string;
  name: string;
}

export interface DocumentListItem {
  id: string;
  title: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  owner: DocumentOwner;
  role: DocumentRole;
  /** This user's own Collaborator row id (including for the owner) — null only in the rare
   *  isPublic-viewer case where they have no Collaborator row at all. Used to "leave" a document. */
  myCollaboratorId: string | null;
  collaboratorCount: number;
  collaborators: DocumentCollaboratorSummary[];
  /** Presence on THIS server instance only (name + color, for avatar dots) — may undercount
   *  under horizontal scaling if editors are connected to a different instance. */
  activeUsers: ActiveUser[];
  /** Cross-server active-user count from Redis — the source of truth for "N editing" badges. */
  activeUserCount: number;
  /** Whether the current user has starred this document — per-user, not document-global. */
  starred: boolean;
  folder: DocumentFolderRef | null;
}

export interface DocumentSearchResult {
  id: string;
  title: string;
  updatedAt: string;
  role: DocumentRole;
  starred: boolean;
}

export interface DocumentDetail {
  id: string;
  title: string;
  /** Base64-encoded Yjs document state (Y.encodeStateAsUpdate), or null for legacy Day 2 documents. */
  content: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  owner: DocumentOwner;
  role: DocumentRole;
  collaborators: DocumentCollaboratorDetail[];
  activeUsers: ActiveUser[];
}

export interface ListDocumentsQuery {
  search?: string;
  sort?: 'updatedAt' | 'createdAt' | 'title';
  order?: 'asc' | 'desc';
  filter?: 'owned' | 'shared' | 'all';
  /** 'root' = only documents with no folder; a folder id = only documents in that folder. */
  folder?: 'root' | string;
  starred?: boolean;
  limit?: number;
}

export const documentApi = {
  create: (title?: string) => api.post<{ document: DocumentSummary }>('/api/documents', { title }),
  getAll: (params?: ListDocumentsQuery) =>
    api.get<{ documents: DocumentListItem[] }>('/api/documents', { params }),
  search: (q: string) => api.get<{ documents: DocumentSearchResult[] }>('/api/documents/search', { params: { q } }),
  getById: (id: string) => api.get<{ document: DocumentDetail }>(`/api/documents/${id}`),
  updateTitle: (id: string, title: string) =>
    api.patch<{ document: DocumentSummary }>(`/api/documents/${id}`, { title }),
  saveContent: (id: string, content: string) =>
    api.patch<{ success: boolean; updatedAt: string }>(`/api/documents/${id}/content`, { content }),
  toggleStar: (id: string) => api.patch<{ starred: boolean }>(`/api/documents/${id}/star`),
  move: (id: string, folderId: string | null) =>
    api.patch<{ document: DocumentSummary & { folderId: string | null; folder: DocumentFolderRef | null } }>(
      `/api/documents/${id}/move`,
      { folderId }
    ),
  delete: (id: string) => api.delete<{ success: boolean }>(`/api/documents/${id}`),
};
