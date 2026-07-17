import { useQuery } from "@tanstack/react-query";
import type { DnsNode } from "@samba-admin/shared";
import { api } from "../api/client";

/** Fetches the direct children of `relativeName` within `zone` (the node's own records are the entry with name=""). */
export function useDnsNodeQuery(zone: string, relativeName: string, enabled: boolean) {
  return useQuery({
    queryKey: ["dns-node", zone, relativeName],
    queryFn: () => api.get<DnsNode[]>(`/api/dns/zones/${encodeURIComponent(zone)}/nodes/${encodeURIComponent(relativeName)}`),
    enabled,
  });
}
