export function filterProviderModelRefs(
  providerId: string,
  refs: readonly string[],
): string[] {
  const prefix = `${providerId}/`;
  return refs.filter((ref) => !ref.startsWith(prefix));
}
