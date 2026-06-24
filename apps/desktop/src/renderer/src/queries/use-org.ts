import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { harnessQueryFns } from "./harness-query-fns";
import { remoteKeys } from "./query-keys";
import { useRemoteEnabled } from "./use-remote-enabled";

const ORG_STALE_MS = 120_000;
const MEMBERS_STALE_MS = 60_000;

export function useOrganizationQuery(options?: { enabled?: boolean }) {
  const enabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.org.organization(),
    queryFn: harnessQueryFns.getOrganization,
    enabled,
    staleTime: ORG_STALE_MS,
  });
}

export function useOrgMembersQuery(options?: { enabled?: boolean }) {
  const enabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.org.members(),
    queryFn: harnessQueryFns.listOrgMembers,
    enabled,
    staleTime: MEMBERS_STALE_MS,
  });
}

export function useOrgCanManageQuery(options?: { enabled?: boolean }) {
  const enabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.org.canManage(),
    queryFn: harnessQueryFns.getOrgCanManage,
    enabled,
    staleTime: MEMBERS_STALE_MS,
  });
}

export function useOrgInviteCodeQuery(options?: { enabled?: boolean }) {
  const enabled = useRemoteEnabled(options?.enabled);

  return useQuery({
    queryKey: remoteKeys.org.inviteCode(),
    queryFn: harnessQueryFns.getOrgInviteCode,
    enabled,
    staleTime: MEMBERS_STALE_MS,
  });
}

export function useUpdateOrganizationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.updateOrganization,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.org.organization() });
    },
  });
}

export function useRegenerateOrgInviteCodeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.regenerateOrgInviteCode,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.org.inviteCode() });
    },
  });
}

export function useUpdateOrgMemberRoleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.updateOrgMemberRole,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.org.members() });
    },
  });
}

export function useRemoveOrgMemberMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: harnessQueryFns.removeOrgMember,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.org.members() });
    },
  });
}
