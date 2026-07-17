import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CupsPrinterSummary, PrintServerStatus, WindowsDriverPackage } from "@samba-admin/shared";
import { api } from "../api/client";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { useToastStore } from "../state/toastStore";
import { PrintServerEnablePanel } from "./PrintServerEnablePanel";
import { NewPrinterDialog } from "./NewPrinterDialog";
import { PrinterPropertiesDialog } from "./PrinterPropertiesDialog";
import { DriverUploadDialog } from "./DriverUploadDialog";

type SelectedNode = { kind: "printer"; name: string } | { kind: "driver"; driverId: string } | null;

type MenuOpenEntry = { kind: "server" } | { kind: "printers-container" } | { kind: "drivers-container" } | { kind: "printer"; name: string };

type MenuState = MenuOpenEntry & { x: number; y: number };

export function PrintLayout() {
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("print-layout-tree-width", 260, 200, 560);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["server", "printers", "drivers"]));
  const [selectedNode, setSelectedNode] = useState<SelectedNode>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showNewPrinter, setShowNewPrinter] = useState(false);
  const [showUploadDriver, setShowUploadDriver] = useState(false);
  const [editingPrinterName, setEditingPrinterName] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const statusQuery = useQuery({
    queryKey: ["print-server-status"],
    queryFn: () => api.get<PrintServerStatus>("/api/print-server/status"),
  });

  const printersQuery = useQuery({
    queryKey: ["print-printers"],
    queryFn: () => api.get<CupsPrinterSummary[]>("/api/print/printers"),
    enabled: !!statusQuery.data?.ready,
  });

  const driversQuery = useQuery({
    queryKey: ["print-drivers"],
    queryFn: () => api.get<WindowsDriverPackage[]>("/api/print/drivers"),
    enabled: !!statusQuery.data?.ready,
  });

  const deletePrinterMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/api/print/printers/${encodeURIComponent(name)}`),
    onSuccess: () => {
      pushToast("success", "Drucker gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["print-printers"] });
      setSelectedNode(null);
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (name: string) => api.post(`/api/print/printers/${encodeURIComponent(name)}/default`),
    onSuccess: () => {
      pushToast("success", "Standarddrucker gesetzt.");
      queryClient.invalidateQueries({ queryKey: ["print-printers"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api.post(`/api/print/printers/${encodeURIComponent(name)}/${enabled ? "enable" : "disable"}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print-printers"] });
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
    : menu.kind === "server" || menu.kind === "printers-container"
      ? [{ label: "Neuer Drucker...", onClick: () => setShowNewPrinter(true) }]
      : menu.kind === "drivers-container"
        ? [{ label: "Treiber hochladen...", onClick: () => setShowUploadDriver(true) }]
        : [
            { label: "Eigenschaften...", onClick: () => setSelectedNode({ kind: "printer", name: menu.name }) },
            { label: "Als Standard festlegen", onClick: () => setDefaultMutation.mutate(menu.name) },
            { separator: true },
            {
              label: "Löschen",
              danger: true,
              onClick: () => {
                if (confirm(`Drucker "${menu.name}" wirklich löschen?`)) deletePrinterMutation.mutate(menu.name);
              },
            },
          ];

  if (statusQuery.isLoading) {
    return <div className="p-4 text-sm text-slate-400">Lade…</div>;
  }

  if (!statusQuery.data?.ready) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h2 className="mb-3 text-lg font-medium text-slate-900 dark:text-slate-100">Druckserver</h2>
        <PrintServerEnablePanel onDone={() => queryClient.invalidateQueries({ queryKey: ["print-server-status"] })} />
      </div>
    );
  }

  const printers = printersQuery.data ?? [];
  const drivers = driversQuery.data ?? [];

  return (
    <div className="flex h-full">
      <aside style={{ width: treeWidth }} className="shrink-0 overflow-y-auto border-r border-slate-200 p-2 dark:border-slate-800">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Druckverwaltung</h2>

        <TreeRow
          label="Drucker"
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
              label="Druckerwarteschlangen"
              iconType="container"
              expanded={expandedNodes.has("printers")}
              onToggle={() => toggleExpand("printers")}
              onSelect={() => {}}
              onContextMenu={(e) => handleContextMenu(e, { kind: "printers-container" })}
              depth={1}
            />
            {expandedNodes.has("printers") &&
              printers.map((p) => (
                <TreeRow
                  key={p.name}
                  label={p.isDefault ? `${p.name} (Standard)` : p.name}
                  iconType="printer"
                  onSelect={() => setSelectedNode({ kind: "printer", name: p.name })}
                  onContextMenu={(e) => handleContextMenu(e, { kind: "printer", name: p.name })}
                  selected={selectedNode?.kind === "printer" && selectedNode.name === p.name}
                  depth={2}
                  statusColor={p.state === "idle" ? "#22c55e" : p.state === "printing" ? "#3b82f6" : "#94a3b8"}
                />
              ))}

            <TreeRow
              label="Treiber"
              iconType="container"
              expanded={expandedNodes.has("drivers")}
              onToggle={() => toggleExpand("drivers")}
              onSelect={() => {}}
              onContextMenu={(e) => handleContextMenu(e, { kind: "drivers-container" })}
              depth={1}
            />
            {expandedNodes.has("drivers") &&
              drivers.map((d) => (
                <TreeRow
                  key={d.driverId}
                  label={d.displayName}
                  iconType="driver"
                  onSelect={() => setSelectedNode({ kind: "driver", driverId: d.driverId })}
                  selected={selectedNode?.kind === "driver" && selectedNode.driverId === d.driverId}
                  depth={2}
                />
              ))}
          </>
        )}
      </aside>

      <ResizeHandle onMouseDown={onResizeMouseDown} />

      <main className="flex-1 overflow-auto p-4">
        {selectedNode?.kind === "printer" ? (
          (() => {
            const printer = printers.find((p) => p.name === selectedNode.name);
            if (!printer) return null;
            return (
              <div className="max-w-2xl space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">{printer.name}</h3>
                <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">Gerätepfad</dt>
                  <dd className="font-mono text-xs text-slate-700 dark:text-slate-300">{printer.deviceUri}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Status</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{printer.state}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Freigegeben</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{printer.shared ? "Ja" : "Nein"}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Standort</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{printer.location || "–"}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Windows-Treiber</dt>
                  <dd className="text-slate-700 dark:text-slate-300">
                    {printer.driverId ? drivers.find((d) => d.driverId === printer.driverId)?.displayName ?? printer.driverId : "Kein Treiber zugewiesen"}
                  </dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600"
                    onClick={() => setEditingPrinterName(printer.name)}
                  >
                    Bearbeiten...
                  </button>
                  <button
                    className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600"
                    onClick={() => setDefaultMutation.mutate(printer.name)}
                  >
                    Als Standard festlegen
                  </button>
                  <button
                    className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600"
                    onClick={() => toggleEnabledMutation.mutate({ name: printer.name, enabled: printer.state === "stopped" })}
                  >
                    {printer.state === "stopped" ? "Aktivieren" : "Deaktivieren"}
                  </button>
                </div>
              </div>
            );
          })()
        ) : selectedNode?.kind === "driver" ? (
          (() => {
            const driver = drivers.find((d) => d.driverId === selectedNode.driverId);
            if (!driver) return null;
            return (
              <div className="max-w-2xl space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">{driver.displayName}</h3>
                <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">Architektur</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{driver.arch}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">INF-Datei</dt>
                  <dd className="font-mono text-xs text-slate-700 dark:text-slate-300">{driver.infFileName}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Dateien</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{driver.files.join(", ")}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Im Treiberspeicher</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{driver.installedInSamba ? "Ja" : "Noch nicht zugewiesen"}</dd>
                </dl>
                <button
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500"
                  onClick={async () => {
                    if (!confirm(`Treiberpaket "${driver.displayName}" wirklich löschen?`)) return;
                    await api.delete(`/api/print/drivers/${driver.driverId}`);
                    pushToast("success", "Treiberpaket gelöscht.");
                    queryClient.invalidateQueries({ queryKey: ["print-drivers"] });
                    setSelectedNode(null);
                  }}
                >
                  Löschen
                </button>
              </div>
            );
          })()
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <div className="text-center">
              <p className="text-lg font-medium text-slate-500 dark:text-slate-400">Druckverwaltung</p>
              <p className="mt-2">Wähle einen Drucker oder Treiber in der Baumansicht aus.</p>
            </div>
          </div>
        )}
      </main>

      {menu && menuEntries && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} />}
      {showNewPrinter && <NewPrinterDialog onDone={() => setShowNewPrinter(false)} />}
      {showUploadDriver && <DriverUploadDialog onDone={() => setShowUploadDriver(false)} />}
      {editingPrinterName &&
        (() => {
          const printer = printers.find((p) => p.name === editingPrinterName);
          if (!printer) return null;
          return <PrinterPropertiesDialog printer={printer} drivers={drivers} onDone={() => setEditingPrinterName(null)} />;
        })()}
    </div>
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
  statusColor,
}: {
  label: string;
  iconType: "server" | "container" | "printer" | "driver";
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  selected?: boolean;
  depth: number;
  statusColor?: string;
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
      <PrintTreeIcon type={iconType} statusColor={statusColor} />
      <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function PrintTreeIcon({ type, statusColor }: { type: "server" | "container" | "printer" | "driver"; statusColor?: string }) {
  if (type === "server") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="2" width="14" height="9" rx="1" fill="#2563eb" />
        <rect x="2" y="3" width="12" height="7" fill="#93c5fd" />
        <rect x="6" y="12" width="4" height="1" fill="#1e40af" />
        <rect x="4" y="13" width="8" height="1" rx="0.5" fill="#1e40af" />
      </svg>
    );
  }
  if (type === "printer") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="2" y="5" width="12" height="6" rx="0.5" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.5" />
        <rect x="4" y="2" width="8" height="4" fill="white" stroke="#64748b" strokeWidth="0.5" />
        <rect x="4" y="10" width="8" height="4" fill="white" stroke="#64748b" strokeWidth="0.5" />
        {statusColor && <circle cx="12.5" cy="6" r="1.3" fill={statusColor} />}
      </svg>
    );
  }
  if (type === "driver") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="1" fill="#f1f5f9" stroke="#64748b" strokeWidth="0.6" />
        <path d="M5 5h6M5 8h6M5 11h3" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }
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
