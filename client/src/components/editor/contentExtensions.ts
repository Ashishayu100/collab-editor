import type { AnyExtension } from '@tiptap/core';
import Blockquote from '@tiptap/extension-blockquote';
import BulletList from '@tiptap/extension-bullet-list';
import CodeBlock from '@tiptap/extension-code-block';
import Heading from '@tiptap/extension-heading';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import OrderedList from '@tiptap/extension-ordered-list';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';

/**
 * Formatting extensions shared between the live collaborative editor and the read-only
 * version-history preview, so both render the same document node types identically.
 * Does NOT include Collaboration/CollaborationCaret/Placeholder — those differ per use site.
 */
export function getContentExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      link: false,
      underline: false,
      undoRedo: false, // Yjs's UndoManager (via Collaboration) replaces StarterKit's undo/redo
    }),
    Heading.configure({ levels: [1, 2, 3] }),
    BulletList,
    OrderedList,
    CodeBlock,
    Blockquote,
    HorizontalRule,
    Highlight,
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { class: 'text-blue-500 underline cursor-pointer' },
    }),
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
  ];
}
