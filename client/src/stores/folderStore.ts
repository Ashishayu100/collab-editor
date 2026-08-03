import { create } from 'zustand';
import { FolderNode, folderApi } from '../api/folders';
import { getErrorMessage } from '../lib/utils';

interface FolderStore {
  folders: FolderNode[];
  loading: boolean;
  error: string | null;
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, parentId?: string | null) => Promise<FolderNode>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  loading: false,
  error: null,

  fetchFolders: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await folderApi.list();
      set({ folders: data.folders, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  createFolder: async (name, parentId) => {
    const { data } = await folderApi.create(name, parentId);
    await get().fetchFolders();
    return data.folder;
  },

  renameFolder: async (id, name) => {
    await folderApi.rename(id, name);
    await get().fetchFolders();
  },

  deleteFolder: async (id) => {
    await folderApi.delete(id);
    await get().fetchFolders();
  },
}));
