export function isAuthorizedCronRequest(
  authorizationHeader: string | undefined,
  cronSecret: string | undefined,
): boolean {
  if (!cronSecret) return false;
  const header = authorizationHeader?.trim() ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  return token.length > 0 && token === cronSecret;
}
