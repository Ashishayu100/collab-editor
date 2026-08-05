import { Request, Response } from 'express';
import { ApiError } from '../utils/ApiError';
import {
  exportDocumentAsHtml,
  exportDocumentAsMarkdown,
  exportDocumentAsPdf,
  sanitizeFilename,
} from '../services/export.service';

function requireHtmlBody(req: Request): string {
  const { html } = req.body as { html?: string };
  if (!html || typeof html !== 'string') {
    throw ApiError.badRequest('HTML content is required');
  }
  return html;
}

export async function exportPdfHandler(req: Request, res: Response): Promise<void> {
  const html = requireHtmlBody(req);
  const { pdf, title } = await exportDocumentAsPdf(req.params.id, html);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.pdf"`);
  res.send(pdf);
}

export async function exportMarkdownHandler(req: Request, res: Response): Promise<void> {
  const html = requireHtmlBody(req);
  const { markdown, title } = await exportDocumentAsMarkdown(req.params.id, html);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.md"`);
  res.send(markdown);
}

export async function exportHtmlHandler(req: Request, res: Response): Promise<void> {
  const html = requireHtmlBody(req);
  const { html: fullHtml, title } = await exportDocumentAsHtml(req.params.id, html);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(title)}.html"`);
  res.send(fullHtml);
}
