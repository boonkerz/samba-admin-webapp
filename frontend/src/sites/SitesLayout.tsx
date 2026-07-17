import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdSite, AdSubnet, AdSiteLink, AdTrust } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";

type SelectedNode = { kind: "sites-container" } | { kind: "site"; dn: string } | { kind: "subnets" } | { kind: "site-links" } | { kind: "trusts" };

/** Mirrors real "Active Directory-Standorte und -Dienste" (dssite.msc) — its own tool, separate from ADUC, like DNS Manager. */
export function SitesLayout() {
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("sites-layout-tree-width", 260, 200, 560);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["root", "sites"]));
  const [selected, setSelected] = useState<SelectedNode>({ kind: "sites-container" });
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "sites-container" } | null>(null);
  const [showNewSite, setShowNewSite] = useState(false);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const sitesQuery = useQuery({ queryKey: ["ad-sites"], queryFn: () => api.get<AdSite[]>("/api/sites/sites") });
  const sites = sitesQuery.data ?? [];

  const deleteSiteMutation = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/sites/sites/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "Standort gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["ad-sites"] });
      setSelected({ kind: "sites-container" });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex h-full">
      <aside style={{ width: treeWidth }} className="shrink-0 overflow-y-auto border-r border-slate-200 p-2 dark:border-slate-800">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Standorte und Dienste
        </h2>
        <Row label="Standorte und Dienste" expanded={expanded.has("root")} onToggle={() => toggle("root")} onSelect={() => {}} depth={0} />
        {expanded.has("root") && (
          <>
            <Row
              label="Standorte"
              expanded={expanded.has("sites")}
              onToggle={() => toggle("sites")}
              onSelect={() => setSelected({ kind: "sites-container" })}
              selected={selected.kind === "sites-container"}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, kind: "sites-container" });
              }}
              depth={1}
            />
            {expanded.has("sites") &&
              sites.map((site) => (
                <Row
                  key={site.dn}
                  label={site.name}
                  onSelect={() => setSelected({ kind: "site", dn: site.dn })}
                  selected={selected.kind === "site" && selected.dn === site.dn}
                  depth={2}
                />
              ))}
            <Row
              label="Subnets"
              onSelect={() => setSelected({ kind: "subnets" })}
              selected={selected.kind === "subnets"}
              depth={1}
            />
            <Row
              label="Standortverknüpfungen"
              onSelect={() => setSelected({ kind: "site-links" })}
              selected={selected.kind === "site-links"}
              depth={1}
            />
            <Row
              label="Vertrauensstellungen"
              onSelect={() => setSelected({ kind: "trusts" })}
              selected={selected.kind === "trusts"}
              depth={1}
            />
          </>
        )}
      </aside>

      <ResizeHandle onMouseDown={onResizeMouseDown} />

      <main className="flex-1 overflow-auto p-4">
        {selected.kind === "sites-container" && (
          <SitesTable sites={sites} isLoading={sitesQuery.isLoading} onDelete={(dn) => deleteSiteMutation.mutate(dn)} onNew={() => setShowNewSite(true)} />
        )}
        {selected.kind === "site" && <SiteDetail site={sites.find((s) => s.dn === selected.dn)} />}
        {selected.kind === "subnets" && <SubnetsPanel sites={sites} />}
        {selected.kind === "site-links" && <SiteLinksPanel sites={sites} />}
        {selected.kind === "trusts" && <TrustsPanel />}
      </main>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={[{ label: "Neuer Standort...", onClick: () => setShowNewSite(true) }]}
          onClose={() => setMenu(null)}
        />
      )}
      {showNewSite && <NewSiteDialog onDone={() => setShowNewSite(false)} />}
    </div>
  );
}

function Row({
  label,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
  selected,
  depth,
}: {
  label: string;
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
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
        <path
          d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z"
          fill="#fbbf24"
          stroke="#d97706"
          strokeWidth="0.4"
        />
        <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
      </svg>
      <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function SitesTable({
  sites,
  isLoading,
  onDelete,
  onNew,
}: {
  sites: AdSite[];
  isLoading: boolean;
  onDelete: (dn: string) => void;
  onNew: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Standorte</h2>
        <WindowsButton type="button" onClick={onNew}>
          Neuer Standort...
        </WindowsButton>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Lade…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Beschreibung</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Server</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => (
              <tr key={site.dn} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{site.name}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{site.description ?? ""}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{site.servers.length}</td>
                <td className="px-2 py-1 text-right">
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      if (confirm(`Standort "${site.name}" wirklich löschen?`)) onDelete(site.dn);
                    }}
                  >
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SiteDetail({ site }: { site: AdSite | undefined }) {
  if (!site) return <p className="text-sm text-slate-400">Standort nicht gefunden.</p>;
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">{site.name}</h2>
      <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Server in diesem Standort:</p>
      {site.servers.length === 0 ? (
        <p className="text-sm text-slate-400">Keine Server.</p>
      ) : (
        <ul className="list-disc pl-5 text-sm text-slate-700 dark:text-slate-300">
          {site.servers.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubnetsPanel({ sites }: { sites: AdSite[] }) {
  const [showNew, setShowNew] = useState(false);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const subnetsQuery = useQuery({ queryKey: ["ad-subnets"], queryFn: () => api.get<AdSubnet[]>("/api/sites/subnets") });
  const subnets = subnetsQuery.data ?? [];

  const assignMutation = useMutation({
    mutationFn: ({ dn, siteDn }: { dn: string; siteDn: string | null }) => api.put(`/api/sites/subnets/${encodeDn(dn)}`, { siteDn }),
    onSuccess: () => {
      pushToast("success", "Standort-Zuordnung aktualisiert.");
      queryClient.invalidateQueries({ queryKey: ["ad-subnets"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/sites/subnets/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "Subnetz gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["ad-subnets"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Subnets</h2>
        <WindowsButton type="button" onClick={() => setShowNew(true)}>
          Neues Subnetz...
        </WindowsButton>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-600">
            <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Präfix</th>
            <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Standort</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {subnets.map((subnet) => (
            <tr key={subnet.dn} className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{subnet.name}</td>
              <td className="px-2 py-1">
                <WinSelect
                  value={subnet.siteDn ?? ""}
                  onChange={(e) => assignMutation.mutate({ dn: subnet.dn, siteDn: e.target.value || null })}
                  className="max-w-xs"
                >
                  <option value="">&lt;Keiner&gt;</option>
                  {sites.map((s) => (
                    <option key={s.dn} value={s.dn}>
                      {s.name}
                    </option>
                  ))}
                </WinSelect>
              </td>
              <td className="px-2 py-1 text-right">
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => {
                    if (confirm(`Subnetz "${subnet.name}" wirklich löschen?`)) deleteMutation.mutate(subnet.dn);
                  }}
                >
                  Entfernen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && <NewSubnetDialog sites={sites} onDone={() => setShowNew(false)} />}
    </div>
  );
}

function SiteLinksPanel({ sites }: { sites: AdSite[] }) {
  const [showNew, setShowNew] = useState(false);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const linksQuery = useQuery({ queryKey: ["ad-site-links"], queryFn: () => api.get<AdSiteLink[]>("/api/sites/site-links") });
  const links = linksQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/sites/site-links/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "Standortverknüpfung gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["ad-site-links"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function siteName(dn: string): string {
    return sites.find((s) => s.dn === dn)?.name ?? dn;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Standortverknüpfungen (IP)</h2>
        <WindowsButton type="button" onClick={() => setShowNew(true)}>
          Neue Standortverknüpfung...
        </WindowsButton>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-600">
            <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
            <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Standorte</th>
            <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Kosten</th>
            <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Replikation (Min.)</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.dn} className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{link.name}</td>
              <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{link.siteDns.map(siteName).join(", ")}</td>
              <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{link.cost}</td>
              <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{link.replicationIntervalMinutes}</td>
              <td className="px-2 py-1 text-right">
                <button
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => {
                    if (confirm(`Standortverknüpfung "${link.name}" wirklich löschen?`)) deleteMutation.mutate(link.dn);
                  }}
                >
                  Entfernen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && <NewSiteLinkDialog sites={sites} onDone={() => setShowNew(false)} />}
    </div>
  );
}

function NewSiteDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/sites/sites", { name, description }),
    onSuccess: () => {
      pushToast("success", "Standort erstellt.");
      queryClient.invalidateQueries({ queryKey: ["ad-sites"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <WindowsDialog
      title="Neuer Standort"
      onClose={onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Beschreibung:</WinLabel>
          <WinInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </WindowsDialog>
  );
}

function NewSubnetDialog({ sites, onDone }: { sites: AdSite[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [siteDn, setSiteDn] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/sites/subnets", { name, siteDn: siteDn || undefined }),
    onSuccess: () => {
      pushToast("success", "Subnetz erstellt.");
      queryClient.invalidateQueries({ queryKey: ["ad-subnets"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <WindowsDialog
      title="Neues Subnetz"
      onClose={onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Präfix (CIDR, z. B. 192.168.1.0/24):</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} placeholder="192.168.1.0/24" autoFocus />
        </div>
        <div>
          <WinLabel>Standort:</WinLabel>
          <WinSelect value={siteDn} onChange={(e) => setSiteDn(e.target.value)}>
            <option value="">&lt;Keiner&gt;</option>
            {sites.map((s) => (
              <option key={s.dn} value={s.dn}>
                {s.name}
              </option>
            ))}
          </WinSelect>
        </div>
      </div>
    </WindowsDialog>
  );
}

function NewSiteLinkDialog({ sites, onDone }: { sites: AdSite[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [cost, setCost] = useState("100");
  const [interval, setInterval] = useState("180");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/api/sites/site-links", {
        name,
        siteDns: [...selectedSites],
        cost: Number(cost),
        replicationIntervalMinutes: Number(interval),
      }),
    onSuccess: () => {
      pushToast("success", "Standortverknüpfung erstellt.");
      queryClient.invalidateQueries({ queryKey: ["ad-site-links"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function toggleSite(dn: string) {
    setSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(dn)) next.delete(dn);
      else next.add(dn);
      return next;
    });
  }

  const valid = name.trim().length > 0 && selectedSites.size >= 2;

  return (
    <WindowsDialog
      title="Neue Standortverknüpfung"
      onClose={onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Standorte in dieser Verknüpfung (mind. 2):</WinLabel>
          <div className="max-h-32 overflow-y-auto rounded-sm border border-slate-300 p-2 dark:border-slate-600">
            {sites.map((s) => (
              <label key={s.dn} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                <input type="checkbox" checked={selectedSites.has(s.dn)} onChange={() => toggleSite(s.dn)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Kosten:</WinLabel>
            <WinInput type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <WinLabel>Replizieren alle (Minuten):</WinLabel>
            <WinInput type="number" value={interval} onChange={(e) => setInterval(e.target.value)} />
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}

const DIRECTION_LABEL: Record<AdTrust["direction"], string> = {
  disabled: "Deaktiviert",
  inbound: "Eingehend",
  outbound: "Ausgehend",
  bidirectional: "Bidirektional",
  unknown: "Unbekannt",
};

const TYPE_LABEL: Record<AdTrust["type"], string> = {
  downlevel: "Windows NT (downlevel)",
  uplevel: "Active Directory",
  mit: "MIT/Kerberos-Bereich",
  dce: "DCE",
  unknown: "Unbekannt",
};

/**
 * Real-only view — establishing a trust is inherently a two-sided operation requiring live
 * connectivity and credentials to the partner domain's own DC (samba-tool domain trust create),
 * which this app cannot safely automate or verify without a second domain/forest to test against.
 * Use `samba-tool domain trust create <domain> ...` on the DC directly to set one up.
 */
function TrustsPanel() {
  const trustsQuery = useQuery({ queryKey: ["ad-trusts"], queryFn: () => api.get<AdTrust[]>("/api/sites/trusts") });
  const trusts = trustsQuery.data ?? [];

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-200">Vertrauensstellungen</h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Nur Anzeige. Eine Vertrauensstellung einzurichten erfordert eine Verbindung zur Partnerdomäne — verwende dafür{" "}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">samba-tool domain trust create</code> direkt auf dem Server.
      </p>
      {trustsQuery.isLoading ? (
        <p className="text-sm text-slate-400">Lade…</p>
      ) : trusts.length === 0 ? (
        <p className="text-sm text-slate-400">Keine Vertrauensstellungen vorhanden.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Partnerdomäne</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Richtung</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
            </tr>
          </thead>
          <tbody>
            {trusts.map((trust) => (
              <tr key={trust.dn} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{trust.name}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{trust.trustPartner ?? ""}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{DIRECTION_LABEL[trust.direction]}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{TYPE_LABEL[trust.type]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
