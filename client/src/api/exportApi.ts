import { api } from './axios';

export type ExportFormat = 'pdf' | 'markdown' | 'html';

const EXTENSION_BY_FORMAT: Record<ExportFormat, string> = {
  pdf: 'pdf',
  markdown: 'md',
  html: 'html',
};

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'document'
  );
}

/** Downloads the given editor HTML as a PDF, Markdown, or standalone HTML file via the server. */
export async function downloadDocumentExport(
  documentId: string,
  format: ExportFormat,
  html: string,
  documentTitle: string
): Promise<void> {
  const { data } = await api.post<Blob>(
    `/api/documents/${documentId}/export/${format}`,
    { html },
    { responseType: 'blob' }
  );

  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(documentTitle)}.${EXTENSION_BY_FORMAT[format]}`;
  link.click();
  URL.revokeObjectURL(url);
}
