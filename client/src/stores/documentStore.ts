import { create } from 'zustand';
import { Awareness } from 'y-protocols/awareness';
import { documentApi, DocumentDetail, DocumentListItem, DocumentSummary } from '../api/documents';
import { getErrorMessage } from '../lib/utils';
import { ConnectionStatus } from '../lib/WebSocketProvider';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DocumentState {
  documents: DocumentListItem[];
  currentDocument: DocumentDetail | null;
  isLoading: boolean;
  isSaving: boolean;
  saveStatus: SaveStatus;
  connectionStatus: ConnectionStatus;
  /** The active document's Yjs Awareness instance, lifted up so the header can render presence. */
  awareness: Awareness | null;
  error: string | null;

  fetchDocuments: (search?: string) => Promise<void>;
  fetchDocument: (id: string) => Promise<void>;
  createDocument: (title?: string) => Promise<DocumentSummary>;
  updateTitle: (id: string, title: string) => Promise<void>;
  saveContent: (id: string, content: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  setSaveStatus: (status: SaveStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAwareness: (awareness: Awareness | null) => void;
  clearCurrentDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocument: null,
  isLoading: false,
  isSaving: false,
  saveStatus: 'idle',
  connectionStatus: ConnectionStatus.DISCONNECTED,
  awareness: null,
  error: null,

  fetchDocuments: async (search) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await documentApi.getAll(search ? { search } : undefined);
      set({ documents: data.documents, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  fetchDocument: async (id) => {
    set({ isLoading: true, error: null, saveStatus: 'idle' });
    try {
      const { data } = await documentApi.getById(id);
      set({ currentDocument: data.document, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  createDocument: async (title) => {
    const { data } = await documentApi.create(title);
    return data.document;
  },

  updateTitle: async (id, title) => {
    const { data } = await documentApi.updateTitle(id, title);
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, title: data.document.title, updatedAt: data.document.updatedAt } : doc
      ),
      currentDocument:
        state.currentDocument?.id === id
          ? { ...state.currentDocument, title: data.document.title, updatedAt: data.document.updatedAt }
          : state.currentDocument,
    }));
  },

  saveContent: async (id, content) => {
    set({ isSaving: true, saveStatus: 'saving' });
    try {
      const { data } = await documentApi.saveContent(id, content);
      set((state) => ({
        isSaving: false,
        saveStatus: 'saved',
        currentDocument:
          state.currentDocument?.id === id
            ? { ...state.currentDocument, updatedAt: data.updatedAt }
            : state.currentDocument,
      }));
    } catch (error) {
      set({ isSaving: false, saveStatus: 'error', error: getErrorMessage(error) });
      throw error;
    }
  },

  deleteDocument: async (id) => {
    await documentApi.delete(id);
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== id),
      currentDocument: state.currentDocument?.id === id ? null : state.currentDocument,
    }));
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setAwareness: (awareness) => set({ awareness }),

  clearCurrentDocument: () =>
    set({
      currentDocument: null,
      saveStatus: 'idle',
      connectionStatus: ConnectionStatus.DISCONNECTED,
      awareness: null,
      error: null,
    }),
}));
