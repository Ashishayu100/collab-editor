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
  activeUsers: ActiveUser[];
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
}

export const documentApi = {
  create: (title?: string) => api.post<{ document: DocumentSummary }>('/api/documents', { title }),
  getAll: (params?: ListDocumentsQuery) =>
    api.get<{ documents: DocumentListItem[] }>('/api/documents', { params }),
  getById: (id: string) => api.get<{ document: DocumentDetail }>(`/api/documents/${id}`),
  updateTitle: (id: string, title: string) =>
    api.patch<{ document: DocumentSummary }>(`/api/documents/${id}`, { title }),
  saveContent: (id: string, content: string) =>
    api.patch<{ success: boolean; updatedAt: string }>(`/api/documents/${id}/content`, { content }),
  delete: (id: string) => api.delete<{ success: boolean }>(`/api/documents/${id}`),
};
