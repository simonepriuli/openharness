import { parse as parseYaml } from "yaml";

import type { DocPage, SearchResult, WelcomeCard } from "./types";
import { docsNavigation, pathToSlug, slugToDocPath } from "./docs-nav";

const rawModules = import.meta.glob("../../content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function normalizeModulePath(modulePath: string): string {
  const marker = "/content/";
  const index = modulePath.lastIndexOf(marker);
  if (index === -1) return modulePath;
  return modulePath.slice(index + marker.length);
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  if (!raw.startsWith("---\n")) {
    return { data: {}, content: raw };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { data: {}, content: raw };
  }

  const yamlBlock = raw.slice(4, end);
  const content = raw.slice(end + 4).replace(/^\n/, "");
  const data = parseYaml(yamlBlock);

  return {
    data: data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
    content,
  };
}

function parseWelcomeCards(value: unknown): WelcomeCard[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cards: WelcomeCard[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      "title" in item &&
      "description" in item &&
      "href" in item &&
      typeof item.title === "string" &&
      typeof item.description === "string" &&
      typeof item.href === "string"
    ) {
      cards.push({
        title: item.title,
        description: item.description,
        href: item.href,
      });
    }
  }
  return cards.length > 0 ? cards : undefined;
}

function buildPages(): Map<string, DocPage> {
  const pages = new Map<string, DocPage>();

  for (const [modulePath, raw] of Object.entries(rawModules)) {
    const docPath = normalizeModulePath(modulePath);
    const parsed = parseFrontmatter(raw);
    const slug = pathToSlug(docPath);
    const title =
      typeof parsed.data.title === "string" ? parsed.data.title : docPath;
    const description =
      typeof parsed.data.description === "string" ? parsed.data.description : "";

    pages.set(slug, {
      path: docPath,
      slug,
      title,
      description,
      body: parsed.content.trim(),
      startHereCards: parseWelcomeCards(parsed.data.startHereCards),
      featureCards: parseWelcomeCards(parsed.data.featureCards),
    });
  }

  return pages;
}

const pages = buildPages();

export function getAllPages(): DocPage[] {
  return [...pages.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getPageBySlug(slug: string): DocPage | undefined {
  const normalized = slug === "" ? "/" : slug.startsWith("/") ? slug : `/${slug}`;
  return pages.get(normalized);
}

export function getAllSlugs(): string[] {
  return [...pages.keys()];
}

export function buildSearchIndex(): SearchResult[] {
  return getAllPages().map((page) => ({
    slug: page.slug,
    title: page.title,
    description: page.description,
    snippet: page.body.replace(/\s+/g, " ").slice(0, 200),
  }));
}

export function resolveNavHref(path: string): string {
  return pathToSlug(path);
}

export function getDefaultSlug(): string {
  return "/";
}

export function slugExists(slug: string): boolean {
  return pages.has(slug);
}

export function getNavPaths(): string[] {
  const paths: string[] = [];
  for (const group of docsNavigation.navigation) {
    for (const item of group.items) {
      paths.push(resolveNavHref(item.path));
    }
  }
  return paths;
}

export { slugToDocPath };
