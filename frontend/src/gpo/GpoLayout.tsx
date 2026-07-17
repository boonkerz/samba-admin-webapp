import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, DomainInfo, GpoLink } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { GpoEditor } from "./GpoEditor";
import { GpoPropertiesView } from "./GpoPropertiesView";
import { NewGpoDialog } from "./NewGpoDialog";
import { CreateAndLinkGpoDialog } from "./CreateAndLinkGpoDialog";
import { LinkExistingGpoDialog } from "./LinkExistingGpoDialog";
import { GpoModelingView } from "./GpoModelingView";
import { CopyGpoDialog } from "./CopyGpoDialog";
import { RestoreGpoDialog } from "./RestoreGpoDialog";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { useToastStore } from "../state/toastStore";

type TreeNode =
  | { type: "forest"; name: string }
  | { type: "domain"; name: string; dnsName: string; netbiosName: string }
  | { type: "domain-root"; name: string }
  | { type: "gpo"; gpo: GpoObject }
  | { type: "ou"; dn: string; name: string; childOus: { dn: string; name: string }[] }
  | { type: "container"; name: string }
  | { type: "sites" }
  | { type: "gpo-modeling" }
  | { type: "gpo-results" };

export function GpoLayout() {
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("gpo-layout-tree-width", 288, 220, 640);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["forest", "domain"]));
  const [editingGpo, setEditingGpo] = useState<GpoObject | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    kind: "gpo-container" | "gpo" | "ou";
    gpo?: GpoObject;
    ou?: { dn: string; name: string };
  } | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createAndLinkOu, setCreateAndLinkOu] = useState<{ dn: string; name: string } | null>(null);
  const [linkExistingOu, setLinkExistingOu] = useState<{ dn: string; name: string } | null>(null);
  const [copyGpoTarget, setCopyGpoTarget] = useState<GpoObject | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const deleteGpoMutation = useMutation({
    mutationFn: (guid: string) => api.delete(`/api/gpo/${guid}`),
    onSuccess: () => {
      pushToast("success", "Gruppenrichtlinienobjekt gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["gpo-list"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const domainQuery = useQuery({
    queryKey: ["gpo-domain"],
    queryFn: () => api.get<DomainInfo>("/api/directory/domain"),
  });

  const gposQuery = useQuery({
    queryKey: ["gpo-list"],
    queryFn: () => api.get<GpoObject[]>("/api/directory/gpos"),
  });

  const ouTreeQuery = useQuery({
    queryKey: ["gpo-ou-tree"],
    queryFn: () => api.get<{ dn: string; name: string; childOus: { dn: string; name: string }[] }[]>("/api/directory/ou-tree"),
  });

  const domain = domainQuery.data;
  const gpos = gposQuery.data ?? [];
  const ous = ouTreeQuery.data ?? [];

  function toggleExpand(key: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleGpoDoubleClick(gpo: GpoObject) {
    setEditingGpo(gpo);
  }

  function handleGpoContextMenu(e: MouseEvent, kind: "gpo-container" | "gpo", gpo?: GpoObject) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, kind, gpo });
  }

  function handleOuContextMenu(e: MouseEvent, ou: { dn: string; name: string }) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, kind: "ou", ou });
  }

  const menuEntries: ContextMenuEntry[] | undefined = !menu
    ? undefined
    : menu.kind === "gpo-container"
      ? [
          { label: "Neu", children: [{ label: "Gruppenrichtlinienobjekt...", onClick: () => setShowCreateDialog(true) }] },
          { separator: true },
          { label: "Wiederherstellen...", onClick: () => setShowRestoreDialog(true) },
        ]
      : menu.kind === "ou"
        ? [
            { label: "Gruppenrichtlinienobjekt hier erstellen und verknüpfen...", onClick: () => setCreateAndLinkOu(menu.ou!) },
            { label: "Vorhandenes Gruppenrichtlinienobjekt verknüpfen...", onClick: () => setLinkExistingOu(menu.ou!) },
          ]
        : [
            { label: "Kopieren...", onClick: () => setCopyGpoTarget(menu.gpo!) },
            { label: "Sichern...", onClick: () => (window.location.href = `/api/gpo/${menu.gpo!.guid}/backup`) },
            { separator: true },
            {
              label: "Löschen",
              danger: true,
              onClick: () => {
                if (confirm(`"${menu.gpo!.displayName}" wirklich löschen?`)) deleteGpoMutation.mutate(menu.gpo!.guid);
              },
            },
          ];

  if (editingGpo) {
    return <GpoEditor gpo={editingGpo} onClose={() => setEditingGpo(null)} />;
  }

  return (
    <div className="flex h-full">
      {/* Left tree panel */}
      <aside style={{ width: treeWidth }} className="shrink-0 overflow-y-auto border-r border-slate-200 p-2 dark:border-slate-800">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Gruppenrichtlinienverwaltung
        </h2>

        {/* Forest root */}
        <TreeViewItem
          label={domain ? `Gesamtstruktur: ${domain.dnsName}` : "Gesamtstruktur"}
          type="forest"
          expanded={expandedNodes.has("forest")}
          onToggle={() => toggleExpand("forest")}
          onSelect={() => setSelectedNode({ type: "forest", name: domain?.dnsName ?? "" })}
          selected={selectedNode?.type === "forest"}
          depth={0}
        />

        {expandedNodes.has("forest") && (
          <>
            {/* Domains node */}
            <TreeViewItem
              label="Domänen"
              type="domains"
              expanded={expandedNodes.has("domain")}
              onToggle={() => toggleExpand("domain")}
              onSelect={() => {}}
              depth={1}
            />

            {expandedNodes.has("domain") && domain && (
              <>
                {/* Domain node */}
                <TreeViewItem
                  label={domain.dnsName}
                  type="domain"
                  expanded={expandedNodes.has("domain-root")}
                  onToggle={() => toggleExpand("domain-root")}
                  onSelect={() => setSelectedNode({ type: "domain-root", name: domain.dnsName })}
                  selected={selectedNode?.type === "domain-root"}
                  depth={2}
                />

                {expandedNodes.has("domain-root") && (
                  <>
                    {/* GPOs linked directly to the domain root */}
                    {domain && (
                      <LinkedGpoNodes
                        targetDn={domain.dn}
                        depth={3}
                        gpos={gpos}
                        selectedNode={selectedNode}
                        onSelect={setSelectedNode}
                        onDoubleClick={handleGpoDoubleClick}
                      />
                    )}

                    {/* GPOs container */}
                    <TreeViewItem
                      label="Gruppenrichtlinienobjekte"
                      type="gpo-container"
                      expanded={expandedNodes.has("gpos")}
                      onToggle={() => toggleExpand("gpos")}
                      onSelect={() => setSelectedNode({ type: "container", name: "Gruppenrichtlinienobjekte" })}
                      onContextMenu={(e) => handleGpoContextMenu(e, "gpo-container")}
                      selected={selectedNode?.type === "container" && selectedNode.name === "Gruppenrichtlinienobjekte"}
                      depth={3}
                    />

                    {expandedNodes.has("gpos") && gpos.map((gpo) => (
                      <TreeViewItem
                        key={gpo.guid}
                        label={gpo.displayName}
                        type="gpo"
                        onSelect={() => setSelectedNode({ type: "gpo", gpo })}
                        onDoubleClick={() => handleGpoDoubleClick(gpo)}
                        onContextMenu={(e) => handleGpoContextMenu(e, "gpo", gpo)}
                        selected={selectedNode?.type === "gpo" && selectedNode.gpo.guid === gpo.guid}
                        depth={4}
                        icon="gpo"
                      />
                    ))}

                    {/* OUs */}
                    {ous.map((ou) => (
                      <OuTreeNode
                        key={ou.dn}
                        ou={ou}
                        expandedNodes={expandedNodes}
                        onToggle={toggleExpand}
                        onSelect={(node) => setSelectedNode(node)}
                        onContextMenu={handleOuContextMenu}
                        onDoubleClickGpo={handleGpoDoubleClick}
                        selectedNode={selectedNode}
                        gpos={gpos}
                        depth={3}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* Standorte */}
            <TreeViewItem
              label="Standorte"
              type="sites"
              expanded={expandedNodes.has("sites")}
              onToggle={() => toggleExpand("sites")}
              onSelect={() => setSelectedNode({ type: "sites" })}
              selected={selectedNode?.type === "sites"}
              depth={1}
            />

            {/* GPO Modeling */}
            <TreeViewItem
              label="Gruppenrichtlinienmodellierung"
              type="gpo-modeling"
              expanded={expandedNodes.has("gpo-modeling")}
              onToggle={() => toggleExpand("gpo-modeling")}
              onSelect={() => setSelectedNode({ type: "gpo-modeling" })}
              selected={selectedNode?.type === "gpo-modeling"}
              depth={1}
            />

            {/* GPO Results */}
            <TreeViewItem
              label="Gruppenrichtlinienergebnisse"
              type="gpo-results"
              expanded={expandedNodes.has("gpo-results")}
              onToggle={() => toggleExpand("gpo-results")}
              onSelect={() => setSelectedNode({ type: "gpo-results" })}
              selected={selectedNode?.type === "gpo-results"}
              depth={1}
            />
          </>
        )}
      </aside>

      <ResizeHandle onMouseDown={onResizeMouseDown} />

      {/* Right content panel */}
      <main className="flex-1 overflow-auto p-4">
        {selectedNode?.type === "gpo" ? (
          <GpoPropertiesView gpo={selectedNode.gpo} onEdit={() => handleGpoDoubleClick(selectedNode.gpo)} />
        ) : selectedNode?.type === "domain-root" ? (
          <DomainContentView domain={domain!} gpos={gpos} ous={ous} />
        ) : selectedNode?.type === "container" ? (
          <ContainerContentView name={selectedNode.name} gpos={gpos} />
        ) : selectedNode?.type === "gpo-modeling" ? (
          <GpoModelingView />
        ) : selectedNode?.type === "gpo-results" ? (
          <div className="max-w-2xl space-y-2">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Gruppenrichtlinienergebnisse</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Diese Funktion fragt in echtem GPMC die tatsächlich zuletzt angewendeten Richtlinien direkt vom Zielcomputer ab
              (über dessen lokale WMI/RSoP-Daten). Diese Web-Oberfläche läuft auf einem Linux-basierten Samba-Server und hat
              keinen Zugriffsweg auf die WMI-Daten eines entfernten Windows-Clients — dafür bräuchte es eine Windows-seitige
              Komponente (z. B. eine Remote-WMI-Abfrage), die hier nicht existiert. Nutze stattdessen die
              Gruppenrichtlinienmodellierung für eine reine AD-basierte Simulation, oder führe{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">gpresult /r</code> direkt auf dem Zielcomputer aus.
            </p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <div className="text-center">
              <p className="text-lg font-medium text-slate-500 dark:text-slate-400">Gruppenrichtlinienverwaltung</p>
              <p className="mt-2">Wähle einen Knoten in der Baumansicht aus.</p>
            </div>
          </div>
        )}
      </main>

      {menu && menuEntries && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} />}
      {showCreateDialog && <NewGpoDialog onDone={() => setShowCreateDialog(false)} />}
      {createAndLinkOu && (
        <CreateAndLinkGpoDialog targetDn={createAndLinkOu.dn} targetName={createAndLinkOu.name} onDone={() => setCreateAndLinkOu(null)} />
      )}
      {linkExistingOu && (
        <LinkExistingGpoDialog targetDn={linkExistingOu.dn} targetName={linkExistingOu.name} onDone={() => setLinkExistingOu(null)} />
      )}
      {copyGpoTarget && <CopyGpoDialog gpo={copyGpoTarget} onDone={() => setCopyGpoTarget(null)} />}
      {showRestoreDialog && <RestoreGpoDialog onDone={() => setShowRestoreDialog(false)} />}
    </div>
  );
}

function TreeViewItem({
  label,
  type,
  expanded,
  onToggle,
  onSelect,
  onDoubleClick,
  onContextMenu,
  selected,
  depth,
  icon,
}: {
  label: string;
  type: string;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  selected?: boolean;
  depth: number;
  icon?: "gpo" | "gpo-link" | "ou" | "folder";
}) {
  const hasExpand = onToggle !== undefined;

  return (
    <div
      className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
        selected ? "bg-indigo-50 dark:bg-indigo-950" : ""
      }`}
      style={{ paddingLeft: depth * 14 + 4 }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
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
      <TreeNodeIcon type={type} icon={icon} />
      <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function TreeNodeIcon({ type, icon }: { type: string; icon?: string }) {
  // GPO document icon - white page with colored corner. Sized/bordered to
  // fill the canvas as fully as the folder icons do (a mostly-white icon
  // with thin gray lines reads as much smaller/fainter than a solid filled
  // folder even at the same bounding-box size, unless it's given a bolder,
  // darker border and fills more of the viewBox).
  if (icon === "gpo") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="0.5" width="14" height="15" rx="1" fill="white" stroke="#64748b" strokeWidth="1" />
        <rect x="1" y="0.5" width="5" height="5" fill="#3b82f6" opacity="0.85" />
        <rect x="3.5" y="6" width="9.5" height="1" fill="#94a3b8" />
        <rect x="3.5" y="8.3" width="7" height="1" fill="#94a3b8" />
        <rect x="3.5" y="10.6" width="8" height="1" fill="#94a3b8" />
        <rect x="3.5" y="12.9" width="6" height="1" fill="#94a3b8" />
      </svg>
    );
  }

  // Linked GPO - same document icon plus a small link/shortcut arrow badge,
  // matching real GPMC's visual distinction between a GPO's master entry
  // (under "Gruppenrichtlinienobjekte") and its links (shown under whichever
  // domain/OU they're linked to).
  if (icon === "gpo-link") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="0.5" width="14" height="15" rx="1" fill="white" stroke="#64748b" strokeWidth="1" />
        <rect x="1" y="0.5" width="5" height="5" fill="#3b82f6" opacity="0.85" />
        <rect x="3.5" y="6" width="9.5" height="1" fill="#94a3b8" />
        <rect x="3.5" y="8.3" width="7" height="1" fill="#94a3b8" />
        <rect x="3.5" y="10.6" width="8" height="1" fill="#94a3b8" />
        <rect x="3.5" y="12.9" width="6" height="1" fill="#94a3b8" />
        <circle cx="12.5" cy="12.5" r="3.2" fill="#dbeafe" stroke="#2563eb" strokeWidth="0.6" />
        <path d="M11.3 13.7l2.4-2.4M11.3 11.3h2.4v2.4" stroke="#2563eb" strokeWidth="0.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Forest/enterprise icon - triangle shape (like Windows GPMC)
  if (type === "forest") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <path d="M8 1L1 14h14L8 1z" fill="#f59e0b" stroke="#d97706" strokeWidth="0.5" opacity="0.8" />
        <path d="M8 4L4 12h8L8 4z" fill="#fbbf24" opacity="0.6" />
        <circle cx="8" cy="7" r="1.5" fill="white" opacity="0.8" />
      </svg>
    );
  }

  // Domains container - folder with network overlay
  if (type === "domains") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <path d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.4" />
        <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
        <circle cx="8" cy="8" r="2" fill="#3b82f6" opacity="0.6" />
        <line x1="6" y1="8" x2="10" y2="8" stroke="#3b82f6" strokeWidth="0.5" opacity="0.6" />
        <line x1="8" y1="6" x2="8" y2="10" stroke="#3b82f6" strokeWidth="0.5" opacity="0.6" />
      </svg>
    );
  }

  // Domain/server icon - blue monitor
  if (type === "domain" || type === "domain-root") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="2" width="14" height="9" rx="1" fill="#2563eb" />
        <rect x="2" y="3" width="12" height="7" fill="#93c5fd" />
        <rect x="6" y="12" width="4" height="1" fill="#1e40af" />
        <rect x="4" y="13" width="8" height="1" rx="0.5" fill="#1e40af" />
        <path d="M5 6l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // OU icon - folder with OU badge
  if (type === "ou") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <path d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.4" />
        <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
        <rect x="8" y="7" width="5" height="4" rx="0.5" fill="white" stroke="#94a3b8" strokeWidth="0.3" />
        <line x1="9" y1="8.5" x2="12" y2="8.5" stroke="#94a3b8" strokeWidth="0.4" />
        <line x1="9" y1="10" x2="11" y2="10" stroke="#94a3b8" strokeWidth="0.4" />
      </svg>
    );
  }

  // Sites icon - globe
  if (type === "sites") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="#60a5fa" stroke="#3b82f6" strokeWidth="0.5" />
        <ellipse cx="8" cy="8" rx="3" ry="6" fill="none" stroke="white" strokeWidth="0.5" opacity="0.6" />
        <line x1="2" y1="8" x2="14" y2="8" stroke="white" strokeWidth="0.5" opacity="0.6" />
        <line x1="8" y1="2" x2="8" y2="14" stroke="white" strokeWidth="0.5" opacity="0.6" />
      </svg>
    );
  }

  // GPO Modeling/Results - report icon
  if (type === "gpo-modeling" || type === "gpo-results") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="2" y="1" width="12" height="14" rx="1" fill="white" stroke="#94a3b8" strokeWidth="0.5" />
        <rect x="4" y="4" width="2" height="7" fill="#3b82f6" opacity="0.6" />
        <rect x="7" y="6" width="2" height="5" fill="#22c55e" opacity="0.6" />
        <rect x="10" y="3" width="2" height="8" fill="#f59e0b" opacity="0.6" />
      </svg>
    );
  }

  // Default folder - yellow Windows style
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.4" />
      <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
    </svg>
  );
}

/**
 * Renders every GPO linked to `targetDn` as a tree child, matching real
 * GPMC showing a policy directly under the domain/OU it's linked to (in
 * addition to its one "master" entry under Gruppenrichtlinienobjekte).
 * Clicking/double-clicking behaves exactly like the master entry — a link
 * is just a reference to the same GpoObject, not a separate one.
 */
function LinkedGpoNodes({
  targetDn,
  depth,
  gpos,
  selectedNode,
  onSelect,
  onDoubleClick,
}: {
  targetDn: string;
  depth: number;
  gpos: GpoObject[];
  selectedNode: TreeNode | null;
  onSelect: (node: TreeNode) => void;
  onDoubleClick: (gpo: GpoObject) => void;
}) {
  const linksQuery = useQuery({
    queryKey: ["gpo-links", targetDn],
    queryFn: () => api.get<GpoLink[]>(`/api/directory/ous/${encodeDn(targetDn)}/gpo-links`),
  });

  const links = linksQuery.data ?? [];

  return (
    <>
      {links.map((link) => {
        const gpo = gpos.find((g) => g.guid.toLowerCase() === link.gpoGuid.toLowerCase());
        if (!gpo) return null;
        return (
          <TreeViewItem
            key={`${targetDn}-${link.gpoGuid}`}
            label={gpo.displayName}
            type="gpo"
            onSelect={() => onSelect({ type: "gpo", gpo })}
            onDoubleClick={() => onDoubleClick(gpo)}
            selected={selectedNode?.type === "gpo" && selectedNode.gpo.guid === gpo.guid}
            depth={depth}
            icon="gpo-link"
          />
        );
      })}
    </>
  );
}

function OuTreeNode({
  ou,
  expandedNodes,
  onToggle,
  onSelect,
  onContextMenu,
  onDoubleClickGpo,
  selectedNode,
  gpos,
  depth,
}: {
  ou: { dn: string; name: string; childOus: { dn: string; name: string }[] };
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (node: TreeNode) => void;
  onContextMenu: (e: MouseEvent, ou: { dn: string; name: string }) => void;
  onDoubleClickGpo: (gpo: GpoObject) => void;
  selectedNode: TreeNode | null;
  gpos: GpoObject[];
  depth: number;
}) {
  const isExpanded = expandedNodes.has(ou.dn);

  return (
    <>
      <TreeViewItem
        label={ou.name}
        type="ou"
        expanded={ou.childOus.length > 0}
        onToggle={() => onToggle(ou.dn)}
        onSelect={() => onSelect({ type: "ou", dn: ou.dn, name: ou.name, childOus: ou.childOus })}
        onContextMenu={(e) => onContextMenu(e, { dn: ou.dn, name: ou.name })}
        selected={selectedNode?.type === "ou" && selectedNode.dn === ou.dn}
        depth={depth}
      />
      {isExpanded && (
        <>
          <LinkedGpoNodes
            targetDn={ou.dn}
            depth={depth + 1}
            gpos={gpos}
            selectedNode={selectedNode}
            onSelect={onSelect}
            onDoubleClick={onDoubleClickGpo}
          />
          {ou.childOus.map((child) => (
            <TreeViewItem
              key={child.dn}
              label={child.name}
              type="ou"
              onSelect={() => onSelect({ type: "ou", dn: child.dn, name: child.name, childOus: [] })}
              onContextMenu={(e) => onContextMenu(e, { dn: child.dn, name: child.name })}
              selected={selectedNode?.type === "ou" && selectedNode.dn === child.dn}
              depth={depth + 1}
            />
          ))}
        </>
      )}
    </>
  );
}

function DomainContentView({
  domain,
  gpos,
  ous,
}: {
  domain: DomainInfo;
  gpos: GpoObject[];
  ous: { dn: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Domäne: {domain.dnsName}</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">DNS-Name</label>
          <p className="text-sm text-slate-700 dark:text-slate-300">{domain.dnsName}</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">NetBIOS-Name</label>
          <p className="text-sm text-slate-700 dark:text-slate-300">{domain.netbiosName}</p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Gruppenrichtlinienobjekte ({gpos.length})</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">Name</th>
              <th className="px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {gpos.map((gpo) => (
              <tr key={gpo.guid} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{gpo.displayName}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{gpo.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContainerContentView({ name, gpos }: { name: string; gpos: GpoObject[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{name}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">Name</th>
            <th className="px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">GUID</th>
            <th className="px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">Erstellt</th>
          </tr>
        </thead>
        <tbody>
          {gpos.map((gpo) => (
            <tr key={gpo.guid} className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{gpo.displayName}</td>
              <td className="px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400">{gpo.guid}</td>
              <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{gpo.createdTime || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
