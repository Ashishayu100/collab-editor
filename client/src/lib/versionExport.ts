import Collaboration from '@tiptap/extension-collaboration';
import { Editor } from '@tiptap/core';
import * as Y from 'yjs';
import { getContentExtensions } from '../components/editor/contentExtensions';
import { applyYDocState } from './yjs';

const EXPORT_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.6; }
  h1, h2, h3 { font-weight: 600; color: #111827; }
  h1 { font-size: 1.75rem; } h2 { font-size: 1.4rem; } h3 { font-size: 1.15rem; }
  a { color: #2563eb; }
  blockquote { border-left: 3px solid #d1d5db; margin-left: 0; padding-left: 16px; color: #4b5563; }
  pre { background: #f3f4f6; border-radius: 6px; padding: 12px 16px; overflow-x: auto; }
  code { background: #f3f4f6; border-radius: 4px; padding: 2px 4px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  img { max-width: 100%; border-radius: 6px; }
  ul[data-type='taskList'] { list-style: none; padding-left: 0; }
`;

/**
 * Render a version's Yjs state to standalone HTML by driving a detached (never mounted to the
 * real DOM) TipTap Editor instance with the same content extensions as the live editor, then
 * reading back `getHTML()`. Avoids needing y-prosemirror or a server-side TipTap dependency —
 * TipTap's Editor already defaults to an off-DOM <div> when no `element` option is given.
 */
function renderVersionHtml(base64Content: string): string {
  const ydoc = new Y.Doc();
  applyYDocState(ydoc, base64Content);

  const editor = new Editor({
    extensions: [...getContentExtensions(), Collaboration.configure({ document: ydoc, field: 'default' })],
    editable: false,
  });

  const html = editor.getHTML();
  editor.destroy();
  ydoc.destroy();
  return html;
}

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'document'
  );
}

/** Converts a version's content to a downloadable standalone HTML file and triggers the download. */
export function downloadVersionAsHtml(params: {
  content: string;
  documentTitle: string;
  versionNum: number;
  label: string | null;
}): void {
  const bodyHtml = renderVersionHtml(params.content);
  const heading = params.label ?? `Version ${params.versionNum}`;

  const fullHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${params.documentTitle} — ${heading}</title>
<style>${EXPORT_STYLES}</style>
</head>
<body>
<p style="color:#6b7280;font-size:0.85rem;margin-bottom:24px;">${params.documentTitle} &middot; v${params.versionNum}${params.label ? ` &middot; ${params.label}` : ''}</p>
${bodyHtml}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(params.documentTitle)}-v${params.versionNum}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
