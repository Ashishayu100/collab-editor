export type CommentEventType =
  | 'comment:created'
  | 'comment:replied'
  | 'comment:edited'
  | 'comment:deleted'
  | 'comment:resolved'
  | 'comment:unresolved';

export interface CommentEvent {
  type: CommentEventType;
  /** The full comment (with user/resolvedBy/replies included), as returned by the REST API. */
  comment?: unknown;
  /** For delete events. */
  commentId?: string;
  /** For reply events — the thread root's id. */
  parentId?: string;
}
