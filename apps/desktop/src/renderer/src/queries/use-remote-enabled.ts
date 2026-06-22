import { useAuthUser } from "../hooks/useAuthUser";

export function useRemoteEnabled(enabled?: boolean): boolean {
  const { user } = useAuthUser();
  if (enabled === false) return false;
  return Boolean(user);
}
