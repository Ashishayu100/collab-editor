import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Comment highlights are rendered as ProseMirror decorations, not persisted marks — they're a
 * purely local/visual annotation derived from the CommentsPanel's data, re-computed on every
 * comment fetch/WS event. Using decorations (rather than a Mark stored in the Yjs doc) keeps
 * them out of the collaborative document content entirely, so they never sync as an "edit",
 * never enter the undo stack, and never need reconciling between collaborators.
 */
export const commentHighlightPluginKey = new PluginKey<CommentHighlightPluginState>('commentHighlight');

export interface CommentHighlightRange {
  commentId: string;
  from: number;
  to: number;
}

interface CommentHighlightPluginState {
  decorations: DecorationSet;
}

export interface CommentHighlightOptions {
  onCommentClick: (commentId: string) => void;
}

export const CommentHighlight = Extension.create<CommentHighlightOptions>({
  name: 'commentHighlight',

  addOptions() {
    return { onCommentClick: () => {} };
  },

  addProseMirrorPlugins() {
    const { onCommentClick } = this.options;

    return [
      new Plugin<CommentHighlightPluginState>({
        key: commentHighlightPluginKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty }),
          apply(tr, value) {
            const meta = tr.getMeta(commentHighlightPluginKey) as
              | { ranges: CommentHighlightRange[]; activeCommentId: string | null }
              | undefined;

            if (meta) {
              const decorations = meta.ranges.map(({ commentId, from, to }) =>
                Decoration.inline(from, to, {
                  class: `comment-highlight${commentId === meta.activeCommentId ? ' comment-highlight-active' : ''}`,
                  'data-comment-id': commentId,
                })
              );
              return { decorations: DecorationSet.create(tr.doc, decorations) };
            }

            return tr.docChanged ? { decorations: value.decorations.map(tr.mapping, tr.doc) } : value;
          },
        },
        props: {
          decorations(state) {
            return commentHighlightPluginKey.getState(state)?.decorations;
          },
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement | null;
            const el = target?.closest('[data-comment-id]') as HTMLElement | null;
            if (el?.dataset.commentId) {
              onCommentClick(el.dataset.commentId);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

/** One text-node character per entry, mapping a flattened plain-text offset to a ProseMirror position. */
function buildTextIndex(doc: ProseMirrorNode): { text: string; positions: number[] } {
  let text = '';
  const positions: number[] = [];

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        positions.push(pos + i);
      }
      text += node.text;
    } else if (node.isBlock && text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
      positions.push(pos);
    }
    return true;
  });

  return { text, positions };
}

export interface AnchoredComment {
  id: string;
  anchorText: string | null;
  anchorOffset: number | null;
}

/**
 * Best-effort re-anchoring: searches the current document text for each comment's saved
 * snippet, preferring a match near its original character offset (in case the exact snippet
 * appears more than once) and falling back to the first occurrence anywhere in the document.
 * A comment whose snippet can no longer be found (the surrounding text was deleted or heavily
 * edited) simply gets no highlight — it still appears in the panel.
 */
export function computeCommentHighlightRanges(
  doc: ProseMirrorNode,
  comments: AnchoredComment[]
): CommentHighlightRange[] {
  const { text, positions } = buildTextIndex(doc);
  const ranges: CommentHighlightRange[] = [];

  for (const comment of comments) {
    if (!comment.anchorText) continue;

    let index = -1;
    if (comment.anchorOffset !== null && comment.anchorOffset !== undefined) {
      const windowStart = Math.max(0, comment.anchorOffset - 50);
      index = text.indexOf(comment.anchorText, windowStart);
    }
    if (index === -1) {
      index = text.indexOf(comment.anchorText);
    }
    if (index === -1 || index + comment.anchorText.length > positions.length) continue;

    const from = positions[index];
    const to = positions[index + comment.anchorText.length - 1] + 1;
    ranges.push({ commentId: comment.id, from, to });
  }

  return ranges;
}
