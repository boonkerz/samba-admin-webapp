import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TreeNode } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { useDirectoryStore } from "../state/directoryStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { useToastStore } from "../state/toastStore";
import { TreeIcon } from "./TreeIcon";
import { PasswordPoliciesDialog } from "./PasswordPoliciesDialog";

function TreeNodeItem({
  node,
  depth,
  onContextMenu,
}: {
  node: TreeNode;
  depth: number;
  onContextMenu: (e: MouseEvent, node: TreeNode) => void;
}) {
  const expanded = useDirectoryStore((s) => s.expanded.has(node.dn));
  const selected = useDirectoryStore((s) => s.selectedDn === node.dn);
  const toggleExpanded = useDirectoryStore((s) => s.toggleExpanded);
  const select = useDirectoryStore((s) => s.select);
  const showAdvanced = useDirectoryStore((s) => s.showAdvanced);

  const childrenQuery = useQuery({
    queryKey: ["tree-children", node.dn, showAdvanced],
    queryFn: () => api.get<TreeNode[]>(`/api/directory/tree/${encodeDn(node.dn)}/children?advanced=${showAdvanced ? "1" : "0"}`),
    enabled: expanded && node.hasChildren,
  });

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
          selected ? "bg-indigo-50 dark:bg-indigo-950" : ""
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => select(node.dn)}
        onDoubleClick={() => { if (node.hasChildren) toggleExpanded(node.dn); }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (node.hasChildren) toggleExpanded(node.dn);
          }}
          className="w-4 text-xs text-slate-400"
        >
          {node.hasChildren ? (expanded ? "▾" : "▸") : ""}
        </button>
        <TreeIcon type={node.type} />
        <span className="truncate text-slate-800 dark:text-slate-200">{node.name}</span>
      </div>
      {expanded &&
        childrenQuery.data?.map((child) => (
          <TreeNodeItem key={child.dn} node={child} depth={depth + 1} onContextMenu={onContextMenu} />
        ))}
    </div>
  );
}

export function OuTree({
  onNewObject,
  onSearch,
}: {
  onNewObject: (parentDn: string, type: "user" | "group" | "ou") => void;
  onSearch: (baseDn: string) => void;
}) {
  const showAdvanced = useDirectoryStore((s) => s.showAdvanced);
  const toggleShowAdvanced = useDirectoryStore((s) => s.toggleShowAdvanced);
  const rootQuery = useQuery({
    queryKey: ["tree-root", showAdvanced],
    queryFn: () => api.get<TreeNode>(`/api/directory/tree?advanced=${showAdvanced ? "1" : "0"}`),
  });
  const select = useDirectoryStore((s) => s.select);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ node: TreeNode; x: number; y: number }>();
  const [showPasswordPolicies, setShowPasswordPolicies] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tree-root"] });
    queryClient.invalidateQueries({ queryKey: ["tree-children"] });
    queryClient.invalidateQueries({ queryKey: ["objects"] });
  };

  const deleteOuMutation = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/directory/ous/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "Organisationseinheit gelöscht.");
      invalidateAll();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleContextMenu(e: MouseEvent, node: TreeNode) {
    e.preventDefault();
    select(node.dn);
    setMenu({ node, x: e.clientX, y: e.clientY });
  }

  if (rootQuery.isLoading) return <p className="p-2 text-sm text-slate-400">Lade…</p>;
  if (rootQuery.isError) return <p className="p-2 text-sm text-red-500">{(rootQuery.error as Error).message}</p>;
  if (!rootQuery.data) return null;

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Suchen…", onClick: () => onSearch(menu.node.dn) },
    {
      label: "Neu",
      children: [
        { label: "Benutzer…", onClick: () => onNewObject(menu.node.dn, "user") },
        { label: "Gruppe…", onClick: () => onNewObject(menu.node.dn, "group") },
        { label: "Organisationseinheit…", onClick: () => onNewObject(menu.node.dn, "ou") },
      ],
    },
    ...(menu.node.type === "domain"
      ? ([{ label: "Kennwortrichtlinien…", onClick: () => setShowPasswordPolicies(true) }] satisfies ContextMenuEntry[])
      : []),
    { separator: true },
    { label: "Aktualisieren", onClick: () => invalidateAll() },
    ...(menu.node.type === "ou"
      ? ([
          { separator: true },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`"${menu.node.name}" wirklich löschen?`)) deleteOuMutation.mutate(menu.node.dn);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div
      className="h-full overflow-y-auto py-2"
      onContextMenu={(e) => {
        // Right-click on the tree's empty background area (not a node): offer "Neu" for the currently selected container.
        if (e.target === e.currentTarget && rootQuery.data) handleContextMenu(e, rootQuery.data);
      }}
    >
      <label className="mb-1 flex items-center gap-2 px-2 text-xs text-slate-500 dark:text-slate-400">
        <input type="checkbox" checked={showAdvanced} onChange={toggleShowAdvanced} className="h-3.5 w-3.5" />
        Erweiterte Features
      </label>
      <TreeNodeItem node={rootQuery.data} depth={0} onContextMenu={handleContextMenu} />
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {showPasswordPolicies && <PasswordPoliciesDialog onClose={() => setShowPasswordPolicies(false)} />}
    </div>
  );
}
