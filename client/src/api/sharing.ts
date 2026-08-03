import { api } from './axios';
import { DocumentRole } from './documents';

export type ShareableRole = Extract<DocumentRole, 'VIEWER' | 'EDITOR'>;

export interface Collaborator {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: DocumentRole;
  addedAt: string;
  isOwner: boolean;
}

export interface ShareLinkStatus {
  enabled: boolean;
  token?: string;
  role?: ShareableRole;
  url?: string;
}

export interface AcceptShareLinkResult {
  documentId: string;
  role: DocumentRole;
}

export const sharingApi = {
  listCollaborators: (documentId: string) =>
    api.get<{ collaborators: Collaborator[] }>(`/api/documents/${documentId}/collaborators`),
  addCollaborator: (documentId: string, email: string, role: ShareableRole) =>
    api.post<{ collaborator: Collaborator }>(`/api/documents/${documentId}/collaborators`, { email, role }),
  updateCollaboratorRole: (documentId: string, collaboratorId: string, role: ShareableRole) =>
    api.patch<{ collaborator: Collaborator }>(`/api/documents/${documentId}/collaborators/${collaboratorId}`, {
      role,
    }),
  removeCollaborator: (documentId: string, collaboratorId: string) =>
    api.delete<{ success: boolean }>(`/api/documents/${documentId}/collaborators/${collaboratorId}`),
  getShareLink: (documentId: string) => api.get<ShareLinkStatus>(`/api/documents/${documentId}/share-link`),
  generateShareLink: (documentId: string, role: ShareableRole) =>
    api.post<ShareLinkStatus>(`/api/documents/${documentId}/share-link`, { role }),
  disableShareLink: (documentId: string) =>
    api.delete<{ success: boolean }>(`/api/documents/${documentId}/share-link`),
  acceptShareLink: (token: string) => api.post<AcceptShareLinkResult>(`/api/share/accept/${token}`),
};
