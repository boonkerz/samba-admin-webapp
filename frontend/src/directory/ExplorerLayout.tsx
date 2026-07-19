import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DirectoryObjectSummary } from "@samba-admin/shared";
import { OuTree } from "./OuTree";
import { ObjectList } from "./ObjectList";
import { ObjectDetailPanel } from "./ObjectDetailPanel";
import { FindObjectsDialog } from "./FindObjectsDialog";
import { dnToPath } from "./dnPath";
import { MoveObjectDialog } from "./MoveObjectDialog";
import { NewUserWizard } from "./UserForm";
import { NewGroupDialog } from "./GroupForm";
import { NewOuDialog } from "./OuForm";
import { Button } from "../components/Button";
import { ThemeToggle } from "../components/ThemeToggle";
import { LanguageToggle } from "../components/LanguageToggle";
import { AuditLogDialog } from "../components/AuditLogDialog";
import { ServerHealthDialog } from "../components/ServerHealthDialog";
import { EventViewerDialog } from "../components/EventViewerDialog";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { useDirectoryStore } from "../state/directoryStore";
import { api } from "../api/client";
import { GpoLayout } from "../gpo/GpoLayout";
import { DnsLayout } from "../dns/DnsLayout";
import { SitesLayout } from "../sites/SitesLayout";
import { PrintLayout } from "../print/PrintLayout";
import { FileSharesLayout } from "../fileshares/FileSharesLayout";

type Tab = "directory" | "gpo" | "dns" | "sites" | "print" | "fileshares";

const TAB_LABEL_KEYS: Record<Tab, string> = {
  directory: "nav.activeDirectory",
  gpo: "nav.groupPolicy",
  dns: "nav.dns",
  sites: "nav.sites",
  print: "nav.print",
  fileshares: "nav.fileShares",
};
const tabs: Tab[] = ["directory", "gpo", "dns", "sites", "print", "fileshares"];

export function ExplorerLayout({ username, onLoggedOut }: { username: string; onLoggedOut: () => void }) {
  const { t } = useTranslation();
  const selectedDn = useDirectoryStore((s) => s.selectedDn);
  const [activeTab, setActiveTab] = useState<Tab>("directory");
  const [openObject, setOpenObject] = useState<DirectoryObjectSummary>();
  const [createType, setCreateType] = useState<"user" | "group" | "ou">();
  const [moveObject, setMoveObject] = useState<DirectoryObjectSummary>();
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showEventViewer, setShowEventViewer] = useState(false);

  async function logout() {
    await api.post("/api/auth/logout");
    onLoggedOut();
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Samba AD Admin</h1>
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                }`}
              >
                {t(TAB_LABEL_KEYS[tab])}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <Button variant="ghost" onClick={() => setShowHealth(true)}>{t("nav.health")}</Button>
          <Button variant="ghost" onClick={() => setShowEventViewer(true)}>{t("nav.eventViewer")}</Button>
          <Button variant="ghost" onClick={() => setShowAuditLog(true)}>{t("nav.auditLog")}</Button>
          <LanguageToggle />
          <ThemeToggle />
          <span>{username}</span>
          <Button variant="ghost" onClick={logout}>{t("nav.logout")}</Button>
        </div>
      </header>

      {showAuditLog && <AuditLogDialog onClose={() => setShowAuditLog(false)} />}
      {showHealth && <ServerHealthDialog onClose={() => setShowHealth(false)} />}
      {showEventViewer && <EventViewerDialog onClose={() => setShowEventViewer(false)} />}

      <div className="flex-1 overflow-hidden">
        {activeTab === "directory" && (
          <DirectoryView
            selectedDn={selectedDn}
            openObject={openObject}
            setOpenObject={setOpenObject}
            createType={createType}
            setCreateType={setCreateType}
            moveObject={moveObject}
            setMoveObject={setMoveObject}
          />
        )}
        {activeTab === "gpo" && <GpoLayout />}
        {activeTab === "dns" && <DnsLayout />}
        {activeTab === "sites" && <SitesLayout />}
        {activeTab === "print" && <PrintLayout />}
        {activeTab === "fileshares" && <FileSharesLayout />}
      </div>
    </div>
  );
}

function DirectoryView({
  selectedDn,
  openObject,
  setOpenObject,
  createType,
  setCreateType,
  moveObject,
  setMoveObject,
}: {
  selectedDn: string | undefined;
  openObject: DirectoryObjectSummary | undefined;
  setOpenObject: (obj: DirectoryObjectSummary | undefined) => void;
  createType: "user" | "group" | "ou" | undefined;
  setCreateType: (type: "user" | "group" | "ou" | undefined) => void;
  moveObject: DirectoryObjectSummary | undefined;
  setMoveObject: (obj: DirectoryObjectSummary | undefined) => void;
}) {
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("directory-tree-width", 280, 220, 640);
  const [searchBaseDn, setSearchBaseDn] = useState<string>();

  return (
    <div className="flex h-full overflow-hidden">
      <aside style={{ width: treeWidth }} className="shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-800">
        <OuTree onNewObject={(_dn, type) => setCreateType(type)} onSearch={setSearchBaseDn} />
      </aside>
      <ResizeHandle onMouseDown={onResizeMouseDown} />
      <main className="flex-1 overflow-hidden">
        {selectedDn ? (
          <ObjectList
            parentDn={selectedDn}
            onOpenObject={setOpenObject}
            onNew={setCreateType}
            onMove={setMoveObject}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Container in der Baumansicht auswählen.
          </div>
        )}
      </main>

      {openObject && (
        <ObjectDetailPanel
          object={openObject}
          parentDn={selectedDn ?? openObject.dn.slice(openObject.dn.indexOf(",") + 1)}
          onClose={() => setOpenObject(undefined)}
        />
      )}

      {searchBaseDn && (
        <FindObjectsDialog baseDnLabel={dnToPath(searchBaseDn)} onOpenObject={setOpenObject} onClose={() => setSearchBaseDn(undefined)} />
      )}

      {createType === "user" && selectedDn && (
        <NewUserWizard parentOuDn={selectedDn} onDone={() => setCreateType(undefined)} />
      )}
      {createType === "group" && selectedDn && (
        <NewGroupDialog parentOuDn={selectedDn} onDone={() => setCreateType(undefined)} />
      )}
      {createType === "ou" && selectedDn && (
        <NewOuDialog parentDn={selectedDn} onDone={() => setCreateType(undefined)} />
      )}

      {moveObject && <MoveObjectDialog object={moveObject} onClose={() => setMoveObject(undefined)} />}
    </div>
  );
}
