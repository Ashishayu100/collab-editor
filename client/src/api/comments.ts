import { api } from './axios';

export interface CommentUser {
  id: string;
  name: string;
  email: string;
}

export interface CommentReply {
  id: string;
  content: string;
  userId: string;
  user: CommentUser;
  parentId: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolvedBy: CommentUser | null;
  anchorText: string | null;
  anchorOffset: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Comment extends CommentReply {
  replies: CommentReply[];
}

export type CommentFilter = 'all' | 'open' | 'resolved';

export const commentApi = {
  list: (documentId: string, resolved?: boolean) =>
    api.get<{ comments: Comment[] }>(`/api/documents/${documentId}/comments`, {
      params: resolved === undefined ? undefined : { resolved },
    }),
  create: (documentId: string, content: string, anchorText?: string, anchorOffset?: number) =>
    api.post<{ comment: Comment }>(`/api/documents/${documentId}/comments`, { content, anchorText, anchorOffset }),
  reply: (documentId: string, commentId: string, content: string) =>
    api.post<{ comment: CommentReply }>(`/api/documents/${documentId}/comments/${commentId}/reply`, { content }),
  edit: (documentId: string, commentId: string, content: string) =>
    api.patch<{ comment: Comment | CommentReply }>(`/api/documents/${documentId}/comments/${commentId}`, {
      content,
    }),
  delete: (documentId: string, commentId: string) =>
    api.delete<void>(`/api/documents/${documentId}/comments/${commentId}`),
  resolve: (documentId: string, commentId: string) =>
    api.patch<{ comment: Comment }>(`/api/documents/${documentId}/comments/${commentId}/resolve`),
  unresolve: (documentId: string, commentId: string) =>
    api.patch<{ comment: Comment }>(`/api/documents/${documentId}/comments/${commentId}/unresolve`),
};
