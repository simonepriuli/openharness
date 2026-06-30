import { existsSync, readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import mammoth from "mammoth";
import { backupFile } from "./backup.js";
import { resolveOfficePath } from "./paths.js";

const DEFAULT_PARAGRAPH_LIMIT = 50;
const DOCUMENT_XML_PATH = "word/document.xml";

export interface DocxParagraph {
  index: number;
  text: string;
  isHeading: boolean;
}

export interface ReadDocxOptions {
  cwd: string;
  path: string;
  offset?: number;
  limit?: number;
}

export interface ReadDocxResult {
  path: string;
  totalParagraphs: number;
  offset: number;
  limit: number;
  truncated: boolean;
  outline: Array<{ index: number; text: string }>;
  paragraphs: DocxParagraph[];
}

export type DocxEditOperation =
  | { op: "replace_text"; find: string; replace: string; matchCase?: boolean }
  | { op: "replace_paragraph"; paragraphIndex: number; text: string }
  | { op: "insert_paragraph_after"; anchorText?: string; paragraphIndex?: number; text: string }
  | { op: "delete_paragraph"; paragraphIndex: number }
  | { op: "append_paragraph"; text: string };

interface ParsedParagraph {
  xml: string;
  text: string;
  isHeading: boolean;
}

function extractParagraphs(documentXml: string): ParsedParagraph[] {
  const paragraphs: ParsedParagraph[] = [];
  const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphRegex.exec(documentXml)) !== null) {
    const xml = match[0];
    const text = extractTextFromParagraphXml(xml);
    const isHeading = /<w:pStyle\b[^>]*w:val="Heading/i.test(xml);
    paragraphs.push({ xml, text, isHeading });
  }
  return paragraphs;
}

function extractTextFromParagraphXml(paragraphXml: string): string {
  const parts: string[] = [];
  const textRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(paragraphXml)) !== null) {
    parts.push(decodeXmlEntities(match[1] ?? ""));
  }
  return parts.join("");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXmlEntities(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildParagraphXml(text: string): string {
  const encoded = encodeXmlEntities(text);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<w:p><w:r><w:t${preserve}>${encoded}</w:t></w:r></w:p>`;
}

function replaceParagraphText(paragraphXml: string, text: string): string {
  if (!/<w:t\b/.test(paragraphXml)) {
    return buildParagraphXml(text);
  }
  let replaced = false;
  return paragraphXml.replace(/<w:t(\s[^>]*)?>[\s\S]*?<\/w:t>/g, (_full, attrs: string) => {
    if (replaced) {
      return "<w:t></w:t>";
    }
    replaced = true;
    const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
    const attrText = typeof attrs === "string" ? attrs : "";
    return `<w:t${attrText || preserve}>${encodeXmlEntities(text)}</w:t>`;
  });
}

function replaceTextInDocumentXml(
  documentXml: string,
  find: string,
  replace: string,
  matchCase: boolean,
): string {
  const paragraphs = extractParagraphs(documentXml);
  if (paragraphs.length === 0) {
    return documentXml;
  }

  const flags = matchCase ? "g" : "gi";
  const pattern = new RegExp(escapeRegExp(find), flags);
  let changed = false;
  const rebuilt = paragraphs.map((paragraph) => {
    if (!pattern.test(paragraph.text)) {
      pattern.lastIndex = 0;
      return paragraph.xml;
    }
    pattern.lastIndex = 0;
    const nextText = paragraph.text.replace(pattern, replace);
    changed = true;
    return replaceParagraphText(paragraph.xml, nextText);
  });

  if (!changed) {
    return documentXml;
  }

  return rebuildDocumentXml(documentXml, rebuilt);
}

function rebuildDocumentXml(documentXml: string, paragraphXmlList: string[]): string {
  const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
  let index = 0;
  return documentXml.replace(paragraphRegex, () => {
    const next = paragraphXmlList[index];
    index += 1;
    return next ?? "";
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appendParagraphXml(documentXml: string, text: string): string {
  const paragraphXml = buildParagraphXml(text);
  if (/<\/w:body>/.test(documentXml)) {
    return documentXml.replace(/<\/w:body>/, `${paragraphXml}</w:body>`);
  }
  return documentXml;
}

function insertParagraphAfterXml(documentXml: string, paragraphXml: string, insertXml: string): string {
  const position = documentXml.indexOf(paragraphXml);
  if (position < 0) {
    throw new Error("Failed to locate paragraph in document XML.");
  }
  const after = position + paragraphXml.length;
  return `${documentXml.slice(0, after)}${insertXml}${documentXml.slice(after)}`;
}

function deleteParagraphXml(documentXml: string, paragraphXml: string): string {
  return documentXml.replace(paragraphXml, "");
}

async function loadDocumentXml(absolutePath: string): Promise<{ zip: JSZip; documentXml: string }> {
  const buffer = readFileSync(absolutePath);
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(DOCUMENT_XML_PATH);
  if (!entry) {
    throw new Error("Invalid .docx file: missing word/document.xml");
  }
  const documentXml = await entry.async("string");
  return { zip, documentXml };
}

async function saveDocumentXml(zip: JSZip, documentXml: string, absolutePath: string): Promise<void> {
  zip.file(DOCUMENT_XML_PATH, documentXml);
  const output = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(absolutePath, output);
}

export async function readDocx(options: ReadDocxOptions): Promise<ReadDocxResult> {
  const absolutePath = resolveOfficePath(options.cwd, options.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${options.path}`);
  }

  const { documentXml } = await loadDocumentXml(absolutePath);
  const parsed = extractParagraphs(documentXml);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? DEFAULT_PARAGRAPH_LIMIT);
  const slice = parsed.slice(offset, offset + limit);

  const paragraphs: DocxParagraph[] = slice.map((paragraph, index) => ({
    index: offset + index,
    text: paragraph.text,
    isHeading: paragraph.isHeading,
  }));

  const outline = parsed
    .map((paragraph, index) => ({ index, text: paragraph.text, isHeading: paragraph.isHeading }))
    .filter((entry) => entry.isHeading && entry.text.trim().length > 0)
    .map((entry) => ({ index: entry.index, text: entry.text.trim() }));

  const truncated = offset + limit < parsed.length;

  // Mammoth sanity check for plain-text preview on empty XML parse.
  if (parsed.length === 0) {
    const mammothResult = await mammoth.extractRawText({ path: absolutePath });
    if (mammothResult.value.trim()) {
      return {
        path: options.path,
        totalParagraphs: 1,
        offset: 0,
        limit,
        truncated: false,
        outline: [],
        paragraphs: [{ index: 0, text: mammothResult.value.trim(), isHeading: false }],
      };
    }
  }

  return {
    path: options.path,
    totalParagraphs: parsed.length,
    offset,
    limit,
    truncated,
    outline,
    paragraphs,
  };
}

function findParagraphIndex(parsed: ParsedParagraph[], options: { anchorText?: string; paragraphIndex?: number }): number {
  if (typeof options.paragraphIndex === "number") {
    if (options.paragraphIndex < 0 || options.paragraphIndex >= parsed.length) {
      throw new Error(`Paragraph index out of range: ${options.paragraphIndex}`);
    }
    return options.paragraphIndex;
  }

  const anchor = options.anchorText?.trim();
  if (!anchor) {
    throw new Error("insert_paragraph_after requires anchorText or paragraphIndex.");
  }

  const index = parsed.findIndex((paragraph) => paragraph.text.includes(anchor));
  if (index < 0) {
    throw new Error(`Anchor text not found: ${anchor}`);
  }
  return index;
}

export async function editDocx(options: {
  cwd: string;
  path: string;
  operations: DocxEditOperation[];
}): Promise<{ path: string; applied: number }> {
  const absolutePath = resolveOfficePath(options.cwd, options.path);
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${options.path}`);
  }

  backupFile(absolutePath);
  const { zip, documentXml } = await loadDocumentXml(absolutePath);
  let nextXml = documentXml;
  let applied = 0;

  for (const operation of options.operations) {
    if (operation.op === "replace_text") {
      const updated = replaceTextInDocumentXml(
        nextXml,
        operation.find,
        operation.replace,
        operation.matchCase ?? false,
      );
      if (updated !== nextXml) {
        applied += 1;
      }
      nextXml = updated;
      continue;
    }

    const parsed = extractParagraphs(nextXml);
    if (operation.op === "delete_paragraph") {
      if (operation.paragraphIndex < 0 || operation.paragraphIndex >= parsed.length) {
        throw new Error(`Paragraph index out of range: ${operation.paragraphIndex}`);
      }
      const target = parsed[operation.paragraphIndex];
      if (!target) {
        throw new Error(`Paragraph index out of range: ${operation.paragraphIndex}`);
      }
      nextXml = deleteParagraphXml(nextXml, target.xml);
      applied += 1;
      continue;
    }

    if (operation.op === "append_paragraph") {
      nextXml = appendParagraphXml(nextXml, operation.text);
      applied += 1;
      continue;
    }

    if (operation.op === "replace_paragraph") {
      const parsed = extractParagraphs(nextXml);
      if (operation.paragraphIndex < 0 || operation.paragraphIndex >= parsed.length) {
        throw new Error(`Paragraph index out of range: ${operation.paragraphIndex}`);
      }
      const target = parsed[operation.paragraphIndex];
      if (!target) {
        throw new Error(`Paragraph index out of range: ${operation.paragraphIndex}`);
      }
      const rebuilt = parsed.map((paragraph, index) =>
        index === operation.paragraphIndex
          ? replaceParagraphText(paragraph.xml, operation.text)
          : paragraph.xml,
      );
      nextXml = rebuildDocumentXml(nextXml, rebuilt);
      applied += 1;
      continue;
    }

    if (operation.op === "insert_paragraph_after") {
      const index = findParagraphIndex(parsed, operation);
      const target = parsed[index];
      if (!target) {
        throw new Error(`Paragraph index out of range: ${index}`);
      }
      nextXml = insertParagraphAfterXml(nextXml, target.xml, buildParagraphXml(operation.text));
      applied += 1;
    }
  }

  await saveDocumentXml(zip, nextXml, absolutePath);
  return { path: options.path, applied };
}
