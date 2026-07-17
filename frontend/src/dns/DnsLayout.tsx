import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DnsZoneSummary, DnsRecordType } from "@samba-admin/shared";
import { api } from "../api/client";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { useToastStore } from "../state/toastStore";
import { DnsRecordTable, type EditRecordTarget } from "./DnsRecordTable";
import { NewZoneDialog } from "./NewZoneDialog";
import { NewRecordDialog } from "./NewRecordDialog";
import { EditRecordDialog } from "./EditRecordDialog";
import { ZoneOptionsDialog } from "./ZoneOptionsDialog";
import { ServerForwardersDialog } from "./ServerForwardersDialog";
import { useDnsNodeQuery } from "./useDnsNode";

interface DnsNodeRef {
  zone: string;
  reverse: boolean;
  relativeName: string; // "@" for the zone apex, else the single label used to query this node's children
  fullName: string; // "@" for the zone apex, else the dotted name relative to the zone, most-specific label first
  label: string;
}

type SelectedNode = { kind: "forward-container" } | { kind: "reverse-container" } | { kind: "node"; ref: DnsNodeRef };

type MenuOpenEntry =
  | { kind: "server" }
  | { kind: "forward-container" }
  | { kind: "reverse-container" }
  | { kind: "node"; ref: DnsNodeRef };

type MenuState = MenuOpenEntry & { x: number; y: number };

const FORWARD_RECORD_TYPES: DnsRecordType[] = ["A", "AAAA", "CNAME", "MX", "NS", "SRV", "TXT"];
const REVERSE_RECORD_TYPES: DnsRecordType[] = ["PTR", "NS", "CNAME", "SRV", "TXT"];

export function DnsLayout() {
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("dns-layout-tree-width", 288, 220, 640);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["server", "forward", "reverse"]));
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [newZoneReverse, setNewZoneReverse] = useState<boolean | null>(null);
  const [newRecord, setNewRecord] = useState<{ ref: DnsNodeRef; type: DnsRecordType } | null>(null);
  const [editRecord, setEditRecord] = useState<EditRecordTarget | null>(null);
  const [zoneOptions, setZoneOptions] = useState<string | null>(null);
  const [showServerForwarders, setShowServerForwarders] = useState(false);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const zonesQuery = useQuery({
    queryKey: ["dns-zones"],
    queryFn: () => api.get<DnsZoneSummary[]>("/api/dns/zones"),
  });
  const zones = zonesQuery.data ?? [];
  const forwardZones = zones.filter((z) => !z.reverse);
  const reverseZones = zones.filter((z) => z.reverse);

  const deleteZoneMutation = useMutation({
    mutationFn: (zoneName: string) => api.delete(`/api/dns/zones/${encodeURIComponent(zoneName)}`),
    onSuccess: () => {
      pushToast("success", "Zone gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["dns-zones"] });
      setSelectedNode(null);
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function toggleExpand(key: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleContextMenu(e: MouseEvent, entry: MenuOpenEntry) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ ...entry, x: e.clientX, y: e.clientY });
  }

  const menuEntries: ContextMenuEntry[] | undefined = !menu
    ? undefined
    : menu.kind === "server"
      ? [{ label: "Eigenschaften...", onClick: () => setShowServerForwarders(true) }]
      : menu.kind === "forward-container"
        ? [{ label: "Neue Zone...", onClick: () => setNewZoneReverse(false) }]
        : menu.kind === "reverse-container"
          ? [{ label: "Neue Zone...", onClick: () => setNewZoneReverse(true) }]
          : buildNodeMenuEntries(menu.ref);

  function buildNodeMenuEntries(ref: DnsNodeRef): ContextMenuEntry[] {
    const primaryTypes = ref.reverse ? REVERSE_RECORD_TYPES : FORWARD_RECORD_TYPES;
    const [firstType, ...restTypes] = primaryTypes;
    const entries: ContextMenuEntry[] = [
      { label: recordMenuLabel(firstType), onClick: () => setNewRecord({ ref, type: firstType }) },
      {
        label: "Anderer neuer Datensatz...",
        children: restTypes.map((t) => ({ label: recordMenuLabel(t), onClick: () => setNewRecord({ ref, type: t }) })),
      },
    ];
    if (ref.relativeName === "@") {
      entries.push({ separator: true }, { label: "Eigenschaften...", onClick: () => setZoneOptions(ref.zone) }, { separator: true }, {
        label: "Zone löschen",
        danger: true,
        onClick: () => {
          if (confirm(`Zone "${ref.zone}" wirklich löschen?`)) deleteZoneMutation.mutate(ref.zone);
        },
      });
    }
    return entries;
  }

  return (
    <div className="flex h-full">
      <aside style={{ width: treeWidth }} className="shrink-0 overflow-y-auto border-r border-slate-200 p-2 dark:border-slate-800">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">DNS-Verwaltung</h2>

        <TreeRow
          label="DNS"
          iconType="server"
          expanded={expandedNodes.has("server")}
          onToggle={() => toggleExpand("server")}
          onSelect={() => {}}
          onContextMenu={(e) => handleContextMenu(e, { kind: "server" })}
          depth={0}
        />

        {expandedNodes.has("server") && (
          <>
            <TreeRow
              label="Forward-Lookupzonen"
              iconType="container"
              expanded={expandedNodes.has("forward")}
              onToggle={() => toggleExpand("forward")}
              onSelect={() => setSelectedNode({ kind: "forward-container" })}
              onContextMenu={(e) => handleContextMenu(e, { kind: "forward-container" })}
              selected={selectedNode?.kind === "forward-container"}
              depth={1}
            />
            {expandedNodes.has("forward") &&
              forwardZones.map((zone) => (
                <DnsZoneTreeNode
                  key={zone.name}
                  zone={zone}
                  depth={2}
                  expandedNodes={expandedNodes}
                  onToggle={toggleExpand}
                  selectedNode={selectedNode}
                  onSelect={setSelectedNode}
                  onContextMenu={handleContextMenu}
                />
              ))}

            <TreeRow
              label="Reverse-Lookupzonen"
              iconType="container"
              expanded={expandedNodes.has("reverse")}
              onToggle={() => toggleExpand("reverse")}
              onSelect={() => setSelectedNode({ kind: "reverse-container" })}
              onContextMenu={(e) => handleContextMenu(e, { kind: "reverse-container" })}
              selected={selectedNode?.kind === "reverse-container"}
              depth={1}
            />
            {expandedNodes.has("reverse") &&
              reverseZones.map((zone) => (
                <DnsZoneTreeNode
                  key={zone.name}
                  zone={zone}
                  depth={2}
                  expandedNodes={expandedNodes}
                  onToggle={toggleExpand}
                  selectedNode={selectedNode}
                  onSelect={setSelectedNode}
                  onContextMenu={handleContextMenu}
                />
              ))}
          </>
        )}
      </aside>

      <ResizeHandle onMouseDown={onResizeMouseDown} />

      <main
        className="flex-1 overflow-auto p-4"
        onContextMenu={(e) => {
          if (selectedNode?.kind === "node") handleContextMenu(e, { kind: "node", ref: selectedNode.ref });
        }}
      >
        {selectedNode?.kind === "node" ? (
          <DnsNodeContent nodeRef={selectedNode.ref} onNavigate={(ref) => setSelectedNode({ kind: "node", ref })} onEdit={setEditRecord} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <div className="text-center">
              <p className="text-lg font-medium text-slate-500 dark:text-slate-400">DNS-Verwaltung</p>
              <p className="mt-2">Wähle eine Zone oder einen Knoten in der Baumansicht aus.</p>
            </div>
          </div>
        )}
      </main>

      {menu && menuEntries && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} />}
      {newZoneReverse !== null && <NewZoneDialog defaultReverse={newZoneReverse} onDone={() => setNewZoneReverse(null)} />}
      {newRecord && (
        <NewRecordDialog zone={newRecord.ref.zone} parentFullName={newRecord.ref.fullName} type={newRecord.type} onDone={() => setNewRecord(null)} />
      )}
      {editRecord && (
        <EditRecordDialog zone={editRecord.zone} fullName={editRecord.fullName} record={editRecord.record} onDone={() => setEditRecord(null)} />
      )}
      {zoneOptions && <ZoneOptionsDialog zoneName={zoneOptions} onDone={() => setZoneOptions(null)} />}
      {showServerForwarders && <ServerForwardersDialog onDone={() => setShowServerForwarders(false)} />}
    </div>
  );
}

function recordMenuLabel(type: DnsRecordType): string {
  switch (type) {
    case "A":
      return "Neuer Host (A)...";
    case "AAAA":
      return "Neuer Host (AAAA)...";
    case "CNAME":
      return "Neuer Alias (CNAME)...";
    case "MX":
      return "Neuer Mailaustausch (MX)...";
    case "NS":
      return "Neuer Namenserver (NS)...";
    case "PTR":
      return "Neuer Zeiger (PTR)...";
    case "SRV":
      return "Neuer Dienst (SRV)...";
    case "TXT":
      return "Neuer Texteintrag (TXT)...";
    default:
      return type;
  }
}

function DnsZoneTreeNode({
  zone,
  depth,
  expandedNodes,
  onToggle,
  selectedNode,
  onSelect,
  onContextMenu,
}: {
  zone: DnsZoneSummary;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  selectedNode: SelectedNode | null;
  onSelect: (node: SelectedNode) => void;
  onContextMenu: (e: MouseEvent, entry: MenuOpenEntry) => void;
}) {
  const ref: DnsNodeRef = { zone: zone.name, reverse: zone.reverse, relativeName: "@", fullName: "@", label: zone.name };
  return (
    <DnsSubTreeNode
      nodeRef={ref}
      depth={depth}
      expandedNodes={expandedNodes}
      onToggle={onToggle}
      selectedNode={selectedNode}
      onSelect={onSelect}
      onContextMenu={onContextMenu}
    />
  );
}

function DnsSubTreeNode({
  nodeRef,
  depth,
  expandedNodes,
  onToggle,
  selectedNode,
  onSelect,
  onContextMenu,
}: {
  nodeRef: DnsNodeRef;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  selectedNode: SelectedNode | null;
  onSelect: (node: SelectedNode) => void;
  onContextMenu: (e: MouseEvent, entry: MenuOpenEntry) => void;
}) {
  const key = `node:${nodeRef.zone}:${nodeRef.fullName}`;
  const expanded = expandedNodes.has(key);
  const query = useDnsNodeQuery(nodeRef.zone, nodeRef.relativeName, expanded);
  // Only sub-domains that themselves have children get a tree node — leaf
  // names (plain host records like "samba") are shown inline in the record
  // list of their parent instead, matching real DNS-Manager's tree exactly.
  const children = (query.data ?? []).filter((n) => n.name !== "" && n.childCount > 0);
  const selected = selectedNode?.kind === "node" && selectedNode.ref.zone === nodeRef.zone && selectedNode.ref.fullName === nodeRef.fullName;

  return (
    <>
      <TreeRow
        label={nodeRef.label}
        iconType={nodeRef.relativeName === "@" ? "zone" : "node"}
        expanded={expanded}
        onToggle={() => onToggle(key)}
        onSelect={() => onSelect({ kind: "node", ref: nodeRef })}
        onContextMenu={(e) => onContextMenu(e, { kind: "node", ref: nodeRef })}
        selected={selected}
        depth={depth}
      />
      {expanded &&
        children.map((child) => {
          const childFullName = nodeRef.relativeName === "@" ? child.name : `${child.name}.${nodeRef.fullName}`;
          const childRef: DnsNodeRef = {
            zone: nodeRef.zone,
            reverse: nodeRef.reverse,
            relativeName: child.name,
            fullName: childFullName,
            label: child.name,
          };
          return (
            <DnsSubTreeNode
              key={child.name}
              nodeRef={childRef}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              selectedNode={selectedNode}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          );
        })}
    </>
  );
}

/**
 * Composes the combined "folder + leaf record" list real DNS-Manager shows
 * for a selected zone/node: sub-domains that themselves have children as
 * navigable folder rows, this node's own apex records, and leaf children's
 * records inlined directly (leaf children never get their own tree node).
 */
function DnsNodeContent({
  nodeRef,
  onNavigate,
  onEdit,
}: {
  nodeRef: DnsNodeRef;
  onNavigate: (ref: DnsNodeRef) => void;
  onEdit: (target: EditRecordTarget) => void;
}) {
  const query = useDnsNodeQuery(nodeRef.zone, nodeRef.relativeName, true);
  const children = query.data ?? [];
  const own = children.find((n) => n.name === "");
  const subfolders = children.filter((n) => n.name !== "" && n.childCount > 0);
  const leaves = children.filter((n) => n.name !== "" && n.childCount === 0);
  const label = nodeRef.relativeName === "@" ? nodeRef.zone : `${nodeRef.fullName}.${nodeRef.zone}`;

  function childFullName(name: string): string {
    return nodeRef.relativeName === "@" ? name : `${name}.${nodeRef.fullName}`;
  }

  return (
    <DnsRecordTable
      title={label}
      isLoading={query.isLoading}
      zone={nodeRef.zone}
      fullName={nodeRef.fullName}
      ownRecords={own?.records ?? []}
      subfolders={subfolders.map((f) => ({
        name: f.name,
        onClick: () =>
          onNavigate({ zone: nodeRef.zone, reverse: nodeRef.reverse, relativeName: f.name, fullName: childFullName(f.name), label: f.name }),
      }))}
      leaves={leaves.map((l) => l.name)}
      onEdit={onEdit}
    />
  );
}

function TreeRow({
  label,
  iconType,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
  selected,
  depth,
}: {
  label: string;
  iconType: "server" | "container" | "zone" | "node";
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  selected?: boolean;
  depth: number;
}) {
  const hasExpand = onToggle !== undefined;
  return (
    <div
      className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
        selected ? "bg-indigo-50 dark:bg-indigo-950" : ""
      }`}
      style={{ paddingLeft: depth * 14 + 4 }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {hasExpand && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="w-4 text-xs text-slate-400"
        >
          {expanded ? "▾" : "▸"}
        </button>
      )}
      {!hasExpand && <span className="w-4" />}
      <DnsTreeIcon type={iconType} />
      <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function DnsTreeIcon({ type }: { type: "server" | "container" | "zone" | "node" }) {
  if (type === "server") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="2" width="14" height="9" rx="1" fill="#2563eb" />
        <rect x="2" y="3" width="12" height="7" fill="#93c5fd" />
        <rect x="6" y="12" width="4" height="1" fill="#1e40af" />
        <rect x="4" y="13" width="8" height="1" rx="0.5" fill="#1e40af" />
        <circle cx="8" cy="6.5" r="2.2" fill="none" stroke="white" strokeWidth="0.8" />
        <line x1="5.8" y1="6.5" x2="10.2" y2="6.5" stroke="white" strokeWidth="0.5" />
      </svg>
    );
  }
  if (type === "zone") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="0.5" width="14" height="15" rx="1" fill="white" stroke="#64748b" strokeWidth="1" />
        <circle cx="8" cy="6.5" r="4" fill="#dbeafe" stroke="#2563eb" strokeWidth="0.7" />
        <ellipse cx="8" cy="6.5" rx="1.7" ry="4" fill="none" stroke="#2563eb" strokeWidth="0.4" />
        <line x1="4" y1="6.5" x2="12" y2="6.5" stroke="#2563eb" strokeWidth="0.4" />
        <rect x="3.5" y="12" width="9" height="1" fill="#94a3b8" />
      </svg>
    );
  }
  // container ("Forward-/Reverse-Lookupzonen") and node (namespace subfolder) - plain yellow folder
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z"
        fill="#fbbf24"
        stroke="#d97706"
        strokeWidth="0.4"
      />
      <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
    </svg>
  );
}
