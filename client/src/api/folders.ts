import { api } from './axios';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
  children: FolderNode[];
}

export const folderApi = {
  list: () => api.get<{ folders: FolderNode[] }>('/api/folders'),
  create: (name: string, parentId?: string | null) =>
    api.post<{ folder: FolderNode }>('/api/folders', { name, parentId: parentId ?? undefined }),
  rename: (id: string, name: string) => api.patch<{ folder: FolderNode }>(`/api/folders/${id}`, { name }),
  delete: (id: string) => api.delete<void>(`/api/folders/${id}`),
};
