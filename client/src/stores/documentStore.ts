import { create } from 'zustand';
import { Awareness } from 'y-protocols/awareness';
import { documentApi, DocumentDetail, DocumentListItem, DocumentSummary, ListDocumentsQuery } from '../api/documents';
import { sharingApi } from '../api/sharing';
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
  /** True from a local edit being sent until the server confirms it's persisted (WS save-confirmed). */
  isSavePending: boolean;
  /** Timestamp of the last server-confirmed save, from the WebSocket save-confirmed message. */
  lastSavedAt: Date | null;
  /** Local doc updates seen since the last save-confirmed — a proxy for "unsynced edit count". */
  pendingChangeCount: number;
  /** How many reconnect attempts the WebSocketProvider has made since the last successful connect. */
  reconnectAttempts: number;
  error: string | null;

  fetchDocuments: (params?: ListDocumentsQuery) => Promise<void>;
  fetchDocument: (id: string) => Promise<void>;
  createDocument: (title?: string) => Promise<DocumentSummary>;
  updateTitle: (id: string, title: string) => Promise<void>;
  saveContent: (id: string, content: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  /** Removes the current user as a collaborator ("leave") — for shared documents they don't own. */
  leaveDocument: (documentId: string, collaboratorId: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  moveDocument: (id: string, folderId: string | null) => Promise<void>;
  setSaveStatus: (status: SaveStatus) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAwareness: (awareness: Awareness | null) => void;
  setSaveIndicatorState: (state: { pending: boolean; lastSavedAt: Date | null; pendingCount: number }) => void;
  setReconnectAttempts: (attempts: number) => void;
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
  isSavePending: false,
  lastSavedAt: null,
  pendingChangeCount: 0,
  reconnectAttempts: 0,
  error: null,

  fetchDocuments: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await documentApi.getAll(params);
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

  leaveDocument: async (documentId, collaboratorId) => {
    await sharingApi.removeCollaborator(documentId, collaboratorId);
    set((state) => ({
      documents: state.documents.filter((doc) => doc.id !== documentId),
      currentDocument: state.currentDocument?.id === documentId ? null : state.currentDocument,
    }));
  },

  toggleStar: async (id) => {
    const { data } = await documentApi.toggleStar(id);
    set((state) => ({
      documents: state.documents.map((doc) => (doc.id === id ? { ...doc, starred: data.starred } : doc)),
    }));
  },

  moveDocument: async (id, folderId) => {
    const { data } = await documentApi.move(id, folderId);
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, folder: data.document.folder } : doc
      ),
    }));
  },

  setSaveStatus: (status) => set({ saveStatus: status }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setAwareness: (awareness) => set({ awareness }),

  setSaveIndicatorState: ({ pending, lastSavedAt, pendingCount }) =>
    set({ isSavePending: pending, lastSavedAt, pendingChangeCount: pendingCount }),

  setReconnectAttempts: (attempts) => set({ reconnectAttempts: attempts }),

  clearCurrentDocument: () =>
    set({
      currentDocument: null,
      saveStatus: 'idle',
      connectionStatus: ConnectionStatus.DISCONNECTED,
      awareness: null,
      isSavePending: false,
      lastSavedAt: null,
      pendingChangeCount: 0,
      reconnectAttempts: 0,
      error: null,
    }),
}));
