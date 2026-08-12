import puppeteer from 'puppeteer';
import TurndownService from 'turndown';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

const EXPORT_DOCUMENT_STYLES = `
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    max-width: 700px;
    margin: 40px auto;
    padding: 0 20px;
    color: #1a1a1a;
    line-height: 1.7;
    font-size: 14px;
  }
  h1 { font-size: 28px; margin: 32px 0 16px; font-weight: 700; }
  h2 { font-size: 22px; margin: 28px 0 14px; font-weight: 600; }
  h3 { font-size: 18px; margin: 24px 0 12px; font-weight: 600; }
  p { margin: 0 0 12px; }
  ul, ol { margin: 0 0 12px; padding-left: 24px; }
  li { margin: 4px 0; }
  blockquote {
    border-left: 3px solid #d1d5db;
    padding-left: 16px;
    margin: 16px 0;
    color: #6b7280;
    font-style: italic;
  }
  pre {
    background: #f3f4f6;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 13px;
    font-family: 'Fira Code', 'Consolas', monospace;
  }
  code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 13px;
  }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  img { max-width: 100%; height: auto; }
  mark { background: #fef08a; padding: 1px 2px; }
  a { color: #2563eb; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
  input[type="checkbox"] { margin-top: 4px; }
  .export-title { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; }
`;

async function getDocumentTitle(documentId: string): Promise<string> {
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { title: true } });
  if (!document) {
    throw ApiError.notFound('Document not found');
  }
  return document.title;
}

function buildFullHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${EXPORT_DOCUMENT_STYLES}</style>
</head>
<body>
<h1 class="export-title">${title}</h1>
${bodyHtml}
</body>
</html>`;
}

/** Filesystem/header-safe filename stem — strips characters `Content-Disposition` can't carry. */
export function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'document';
}

export async function exportDocumentAsHtml(documentId: string, bodyHtml: string): Promise<{ html: string; title: string }> {
  const title = await getDocumentTitle(documentId);
  return { html: buildFullHtml(title, bodyHtml), title };
}

export async function exportDocumentAsPdf(documentId: string, bodyHtml: string): Promise<{ pdf: Buffer; title: string }> {
  const title = await getDocumentTitle(documentId);
  const fullHtml = buildFullHtml(title, bodyHtml);

  const browser = await puppeteer.launch({
    headless: true,
    // Set when running against the system Chromium installed in the Docker image (see
    // server/Dockerfile) instead of Puppeteer's own bundled download; undefined locally.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Docker's default /dev/shm is only 64MB — this avoids relying on it.
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
      printBackground: true,
    });
    return { pdf: Buffer.from(pdf), title };
  } finally {
    await browser.close();
  }
}

function buildTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  turndownService.addRule('taskList', {
    filter: (node) => node.nodeName === 'LI' && node.parentElement?.getAttribute('data-type') === 'taskList',
    replacement: (content, node) => {
      const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]');
      const checked = checkbox?.hasAttribute('checked') ? 'x' : ' ';
      return `- [${checked}] ${content.trim()}\n`;
    },
  });

  turndownService.addRule('highlight', {
    filter: 'mark',
    replacement: (content) => `==${content}==`,
  });

  return turndownService;
}

export async function exportDocumentAsMarkdown(documentId: string, bodyHtml: string): Promise<{ markdown: string; title: string }> {
  const title = await getDocumentTitle(documentId);
  const turndownService = buildTurndownService();
  const markdown = `# ${title}\n\n${turndownService.turndown(bodyHtml)}`;
  return { markdown, title };
}
