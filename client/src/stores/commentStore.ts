import { create } from 'zustand';
import { Comment, CommentReply, commentApi } from '../api/comments';
import { CommentEvent } from '../lib/WebSocketProvider';
import { getErrorMessage } from '../lib/utils';

export type CommentFilterTab = 'all' | 'open' | 'resolved';

interface CommentStore {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  filter: CommentFilterTab;
  activeCommentId: string | null;

  fetchComments: (documentId: string) => Promise<void>;
  addComment: (documentId: string, content: string, anchorText?: string, anchorOffset?: number) => Promise<Comment>;
  addReply: (documentId: string, commentId: string, content: string) => Promise<void>;
  editComment: (documentId: string, commentId: string, content: string) => Promise<void>;
  deleteComment: (documentId: string, commentId: string) => Promise<void>;
  resolveComment: (documentId: string, commentId: string) => Promise<void>;
  unresolveComment: (documentId: string, commentId: string) => Promise<void>;
  setFilter: (filter: CommentFilterTab) => void;
  setActiveComment: (id: string | null) => void;
  handleCommentEvent: (event: CommentEvent) => void;
  clear: () => void;
}

function upsertRoot(comments: Comment[], comment: Comment): Comment[] {
  const existingIndex = comments.findIndex((c) => c.id === comment.id);
  if (existingIndex === -1) {
    return [...comments, comment];
  }
  const next = [...comments];
  // Preserve replies already loaded locally if the incoming payload's replies are stale/empty.
  next[existingIndex] = { ...comment, replies: comment.replies ?? next[existingIndex].replies };
  return next;
}

function upsertReply(comments: Comment[], parentId: string, reply: CommentReply): Comment[] {
  return comments.map((root) => {
    if (root.id !== parentId) return root;
    const existingIndex = root.replies.findIndex((r) => r.id === reply.id);
    if (existingIndex === -1) {
      return { ...root, replies: [...root.replies, reply] };
    }
    const nextReplies = [...root.replies];
    nextReplies[existingIndex] = reply;
    return { ...root, replies: nextReplies };
  });
}

function removeComment(comments: Comment[], commentId: string, parentId?: string): Comment[] {
  if (!parentId) {
    return comments.filter((c) => c.id !== commentId);
  }
  return comments.map((root) =>
    root.id === parentId ? { ...root, replies: root.replies.filter((r) => r.id !== commentId) } : root
  );
}

export const useCommentStore = create<CommentStore>((set, get) => ({
  comments: [],
  loading: false,
  error: null,
  filter: 'all',
  activeCommentId: null,

  fetchComments: async (documentId) => {
    set({ loading: true, error: null });
    try {
      const { data } = await commentApi.list(documentId);
      set({ comments: data.comments, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  addComment: async (documentId, content, anchorText, anchorOffset) => {
    const { data } = await commentApi.create(documentId, content, anchorText, anchorOffset);
    set((state) => ({ comments: upsertRoot(state.comments, data.comment) }));
    return data.comment;
  },

  addReply: async (documentId, commentId, content) => {
    const { data } = await commentApi.reply(documentId, commentId, content);
    set((state) => ({ comments: upsertReply(state.comments, commentId, data.comment) }));
  },

  editComment: async (documentId, commentId, content) => {
    const { data } = await commentApi.edit(documentId, commentId, content);
    const comment = data.comment;
    set((state) => ({
      comments:
        comment.parentId === null
          ? upsertRoot(state.comments, comment as Comment)
          : upsertReply(state.comments, comment.parentId, comment),
    }));
  },

  deleteComment: async (documentId, commentId) => {
    const target = get().comments.find((c) => c.id === commentId);
    const parentId = target
      ? undefined
      : get()
          .comments.find((c) => c.replies.some((r) => r.id === commentId))
          ?.id;
    await commentApi.delete(documentId, commentId);
    set((state) => ({ comments: removeComment(state.comments, commentId, parentId) }));
  },

  resolveComment: async (documentId, commentId) => {
    const { data } = await commentApi.resolve(documentId, commentId);
    set((state) => ({ comments: upsertRoot(state.comments, data.comment) }));
  },

  unresolveComment: async (documentId, commentId) => {
    const { data } = await commentApi.unresolve(documentId, commentId);
    set((state) => ({ comments: upsertRoot(state.comments, data.comment) }));
  },

  setFilter: (filter) => set({ filter }),

  setActiveComment: (id) => set({ activeCommentId: id }),

  handleCommentEvent: (event) => {
    switch (event.type) {
      case 'comment:created':
      case 'comment:resolved':
      case 'comment:unresolved':
        if (event.comment) {
          set((state) => ({ comments: upsertRoot(state.comments, event.comment as Comment) }));
        }
        break;
      case 'comment:replied':
        if (event.comment && event.parentId) {
          set((state) => ({ comments: upsertReply(state.comments, event.parentId!, event.comment as CommentReply) }));
        }
        break;
      case 'comment:edited':
        if (event.comment) {
          const comment = event.comment as CommentReply;
          set((state) => ({
            comments:
              comment.parentId === null
                ? upsertRoot(state.comments, comment as Comment)
                : upsertReply(state.comments, comment.parentId, comment),
          }));
        }
        break;
      case 'comment:deleted':
        if (event.commentId) {
          set((state) => ({ comments: removeComment(state.comments, event.commentId!, event.parentId) }));
        }
        break;
      default:
        break;
    }
  },

  clear: () => set({ comments: [], loading: false, error: null, filter: 'all', activeCommentId: null }),
}));
