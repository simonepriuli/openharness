import type { DocsNavigation } from "./types";

import docsJson from "../../content/docs.json";

export const docsNavigation = docsJson as DocsNavigation;

export function pathToSlug(docPath: string): string {
  if (docPath === "index.md") return "/";
  return `/${docPath.replace(/\.md$/, "")}`;
}

export function slugToDocPath(slug: string): string {
  const normalized = slug === "/" ? "" : slug.replace(/^\//, "");
  if (!normalized) return "index.md";
  return `${normalized}.md`;
}

export function isExternalHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}
