import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdComputer, AdGroup, AdUser, DirectoryObjectSummary } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { SlideOver } from "../components/SlideOver";
import { UserPropertiesDialog } from "./UserPropertiesDialog";
import { GroupDetail } from "./GroupForm";
import { ComputerPropertiesDialog } from "./ComputerPropertiesDialog";
import { GpoLinksPanel } from "./GpoLinksPanel";

export function ObjectDetailPanel({ object, parentDn, onClose }: { object: DirectoryObjectSummary; parentDn: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["objects", parentDn] });
    queryClient.invalidateQueries({ queryKey: ["detail", object.dn] });
    queryClient.invalidateQueries({ queryKey: ["computer-detail", object.dn] });
  };

  const userQuery = useQuery({
    queryKey: ["detail", object.dn],
    queryFn: () => api.get<AdUser>(`/api/directory/users/${encodeDn(object.dn)}`),
    enabled: object.type === "user",
  });
  const groupQuery = useQuery({
    queryKey: ["detail", object.dn],
    queryFn: () => api.get<AdGroup>(`/api/directory/groups/${encodeDn(object.dn)}`),
    enabled: object.type === "group",
  });
  const computerQuery = useQuery({
    queryKey: ["computer-detail", object.dn],
    queryFn: () => api.get<AdComputer>(`/api/directory/computers/${encodeDn(object.dn)}`),
    enabled: object.type === "computer",
  });

  if (object.type === "user") {
    return userQuery.data ? <UserPropertiesDialog user={userQuery.data} onClose={onClose} onChanged={invalidate} /> : null;
  }

  if (object.type === "computer") {
    return computerQuery.data ? (
      <ComputerPropertiesDialog computer={computerQuery.data} onClose={onClose} onChanged={invalidate} />
    ) : null;
  }

  return (
    <SlideOver title={object.name} onClose={onClose}>
      {object.type === "group" && groupQuery.data && <GroupDetail group={groupQuery.data} onChanged={invalidate} />}
      {(object.type === "ou" || object.type === "container") && <GpoLinksPanel ouDn={object.dn} />}
    </SlideOver>
  );
}
