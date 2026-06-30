import { existsSync, readFileSync, statSync, writeFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolveOfficePath } from "./paths.js";

export const MAX_PDF_FILE_BYTES = 25 * 1024 * 1024;
export const DEFAULT_PAGE_LIMIT = 5;
export const MAX_CONVERT_CHARS = 2 * 1024 * 1024;

export const NO_EXTRACTABLE_TEXT_ERROR =
  "No extractable text found — this PDF may be scanned or image-only. OCR is not supported yet.";

export interface ReadPdfOptions {
  cwd: string;
  path: string;
  offset?: number;
  limit?: number;
}

export interface ReadPdfPage {
  page: number;
  text: string;
}

export interface ReadPdfResult {
  path: string;
  totalPages: number;
  offset: number;
  limit: number;
  truncated: boolean;
  pages: ReadPdfPage[];
}

export interface ConvertPdfToMdOptions {
  cwd: string;
  path: string;
}

export interface ConvertPdfToMdResult {
  path: string;
  outputPath: string;
  pageCount: number;
  charCount: number;
}

function assertFileSize(absolutePath: string): void {
  const fileStat = statSync(absolutePath);
  if (fileStat.size > MAX_PDF_FILE_BYTES) {
    throw new Error(`PDF exceeds maximum size of ${MAX_PDF_FILE_BYTES / (1024 * 1024)}MB.`);
  }
}

function assertHasExtractableText(pageTexts: string[]): void {
  if (!pageTexts.some((text) => text.trim().length > 0)) {
    throw new Error(NO_EXTRACTABLE_TEXT_ERROR);
  }
}

async function extractAllPageTexts(absolutePath: string): Promise<string[]> {
  const buffer = readFileSync(absolutePath);
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const texts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    texts.push(text);
  }

  await pdf.destroy();
  return texts;
}

function displayOutputPath(cwd: string, absolutePath: string): string {
  const resolvedCwd = existsSync(cwd) ? realpathSync(path.resolve(cwd)) : path.resolve(cwd);
  const resolvedOutput = existsSync(absolutePath) ? realpathSync(absolutePath) : absolutePath;
  const relativeOutput = path.relative(resolvedCwd, resolvedOutput).replace(/\\/g, "/");
  return relativeOutput.startsWith("..") ? absolutePath : relativeOutput;
}

export async function readPdf(options: ReadPdfOptions): Promise<ReadPdfResult> {
  const absolutePath = resolveOfficePath(options.cwd, options.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`PDF not found: ${options.path}`);
  }
  assertFileSize(absolutePath);

  const allTexts = await extractAllPageTexts(absolutePath);
  assertHasExtractableText(allTexts);

  const totalPages = allTexts.length;
  const offset = options.offset !== undefined ? Math.max(1, options.offset) : 1;
  const limit = options.limit ?? DEFAULT_PAGE_LIMIT;

  if (offset > totalPages) {
    throw new Error(`Offset ${offset} is beyond end of PDF (${totalPages} pages total).`);
  }

  const endPage = Math.min(offset + limit - 1, totalPages);
  const pages: ReadPdfPage[] = [];
  for (let pageNum = offset; pageNum <= endPage; pageNum += 1) {
    pages.push({ page: pageNum, text: allTexts[pageNum - 1] ?? "" });
  }

  return {
    path: options.path,
    totalPages,
    offset,
    limit,
    truncated: endPage < totalPages,
    pages,
  };
}

export async function convertPdfToMd(options: ConvertPdfToMdOptions): Promise<ConvertPdfToMdResult> {
  const absolutePath = resolveOfficePath(options.cwd, options.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`PDF not found: ${options.path}`);
  }
  assertFileSize(absolutePath);

  const allTexts = await extractAllPageTexts(absolutePath);
  assertHasExtractableText(allTexts);

  const sections = allTexts.map((text, index) => `## Page ${index + 1}\n\n${text}`);
  let markdown = sections.join("\n\n");
  if (markdown.length > MAX_CONVERT_CHARS) {
    markdown = `${markdown.slice(0, MAX_CONVERT_CHARS)}\n\n[Truncated at ${MAX_CONVERT_CHARS} characters.]`;
  }

  const outputAbsolutePath = path.join(
    path.dirname(absolutePath),
    `${path.basename(absolutePath, path.extname(absolutePath))}.md`,
  );
  writeFileSync(outputAbsolutePath, markdown, "utf8");

  return {
    path: options.path,
    outputPath: displayOutputPath(options.cwd, outputAbsolutePath),
    pageCount: allTexts.length,
    charCount: markdown.length,
  };
}
