export function buildSessionKey(
  cwd: string,
  opts: { sessionFile?: string | null; conversationId: string },
): string {
  if (opts.sessionFile) {
    return `${cwd}::file::${opts.sessionFile}`;
  }
  return `${cwd}::draft::${opts.conversationId}`;
}
