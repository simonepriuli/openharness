export type PrFileChange = {
  path?: string;
  filename?: string;
  patch?: string | null;
};

export type InlineReviewComment = {
  path: string;
  line: number;
  body: string;
};

export type ValidatedInlineComment = InlineReviewComment & { side: "RIGHT" };

export function collectDiffNewLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = raw.match(/\+(\d+)/);
      newLine = match ? Number.parseInt(match[1]!, 10) : newLine;
      continue;
    }
    if (raw.startsWith("\\")) continue;
    if (raw.startsWith("+") || raw.startsWith(" ")) {
      lines.add(newLine);
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      continue;
    }
  }

  return lines;
}

function filePath(file: PrFileChange): string | undefined {
  return file.path ?? file.filename;
}

export function isLineInFileDiff(
  files: PrFileChange[],
  path: string,
  line: number,
): boolean {
  const file = files.find((entry) => filePath(entry) === path);
  if (!file?.patch) return true;
  return collectDiffNewLines(file.patch).has(line);
}

export function validateInlineComments(
  files: PrFileChange[],
  comments: InlineReviewComment[],
): {
  valid: ValidatedInlineComment[];
  invalid: Array<InlineReviewComment & { reason: string }>;
} {
  const valid: ValidatedInlineComment[] = [];
  const invalid: Array<InlineReviewComment & { reason: string }> = [];

  for (const comment of comments) {
    if (!comment.path?.trim()) {
      invalid.push({ ...comment, reason: "missing path" });
      continue;
    }
    if (!Number.isInteger(comment.line) || comment.line <= 0) {
      invalid.push({ ...comment, reason: "invalid line number" });
      continue;
    }
    if (!comment.body?.trim()) {
      invalid.push({ ...comment, reason: "empty comment body" });
      continue;
    }
    if (!files.some((file) => filePath(file) === comment.path)) {
      invalid.push({ ...comment, reason: "file not in PR diff" });
      continue;
    }
    if (!isLineInFileDiff(files, comment.path, comment.line)) {
      invalid.push({ ...comment, reason: "line not in diff hunk" });
      continue;
    }
    valid.push({ ...comment, side: "RIGHT" });
  }

  return { valid, invalid };
}

export function appendOverflowToSummary(
  summary: string,
  invalid: Array<InlineReviewComment & { reason: string }>,
  failed: InlineReviewComment[],
): string {
  const overflow: string[] = [];
  for (const comment of invalid) {
    overflow.push(`- \`${comment.path}:${comment.line}\` (${comment.reason}): ${comment.body}`);
  }
  for (const comment of failed) {
    overflow.push(`- \`${comment.path}:${comment.line}\` (GitHub rejected): ${comment.body}`);
  }
  if (overflow.length === 0) return summary;
  return `${summary.trim()}\n\n**Additional feedback (could not anchor inline):**\n${overflow.join("\n")}`;
}
