import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryObjectSummary, TreeNode } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { Button } from "../components/Button";
import { Modal } from "../components/SlideOver";
import { useToastStore } from "../state/toastStore";

function PickerNode({ node, depth, selected, onSelect }: { node: TreeNode; depth: number; selected?: string; onSelect: (dn: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const childrenQuery = useQuery({
    queryKey: ["tree-children", node.dn],
    queryFn: () => api.get<TreeNode[]>(`/api/directory/tree/${encodeDn(node.dn)}/children`),
    enabled: expanded && node.hasChildren,
  });

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
          selected === node.dn ? "bg-indigo-50 dark:bg-indigo-950" : ""
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => onSelect(node.dn)}
      >
        <button onClick={(e) => { e.stopPropagation(); if (node.hasChildren) setExpanded((v) => !v); }} className="w-4 text-xs text-slate-400">
          {node.hasChildren ? (expanded ? "▾" : "▸") : ""}
        </button>
        <span className="truncate text-slate-800 dark:text-slate-200">{node.name}</span>
      </div>
      {expanded && childrenQuery.data?.map((child) => (
        <PickerNode key={child.dn} node={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function MoveObjectDialog({ object, onClose }: { object: DirectoryObjectSummary; onClose: () => void }) {
  const [targetDn, setTargetDn] = useState<string>();
  const rootQuery = useQuery({ queryKey: ["tree-root"], queryFn: () => api.get<TreeNode>("/api/directory/tree") });
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const moveMutation = useMutation({
    mutationFn: () => api.post("/api/directory/move", { dn: object.dn, newParentDn: targetDn }),
    onSuccess: () => {
      pushToast("success", `"${object.name}" verschoben.`);
      queryClient.invalidateQueries({ queryKey: ["objects"] });
      queryClient.invalidateQueries({ queryKey: ["tree-children"] });
      onClose();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <Modal title={`"${object.name}" verschieben nach…`} onClose={onClose}>
      <div className="max-h-72 overflow-y-auto rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
        {rootQuery.data && <PickerNode node={rootQuery.data} depth={0} selected={targetDn} onSelect={setTargetDn} />}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button onClick={() => moveMutation.mutate()} disabled={!targetDn || moveMutation.isPending}>
          Verschieben
        </Button>
      </div>
    </Modal>
  );
}
