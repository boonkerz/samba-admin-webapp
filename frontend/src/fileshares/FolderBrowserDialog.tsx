import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FolderBrowseResult } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput } from "../components/WindowsDialog";

/** Windows' "Browse For Folder" dialog equivalent — picks a share's underlying path without typing it out or checking via SSH. */
export function FolderBrowserDialog({ initialPath, onSelect, onClose }: { initialPath: string; onSelect: (path: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [path, setPath] = useState(initialPath || "/");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState<string>();

  const browseQuery = useQuery({
    queryKey: ["fileshares-browse", path],
    queryFn: () => api.get<FolderBrowseResult>(`/api/fileshares/browse/list?path=${encodeURIComponent(path)}`),
  });

  const createFolderMutation = useMutation({
    mutationFn: () => api.post<FolderBrowseResult>("/api/fileshares/browse/mkdir", { parentPath: path, name: newFolderName }),
    onSuccess: (result) => {
      setPath(result.path);
      setCreatingFolder(false);
      setNewFolderName("");
      queryClient.invalidateQueries({ queryKey: ["fileshares-browse"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const data = browseQuery.data;

  return (
    <WindowsDialog
      title={t("folderBrowser.title", "Browse For Folder")}
      onClose={onClose}
      footer={
        <>
          <WindowsButton variant="primary" onClick={() => onSelect(path)}>
            {t("folderBrowser.select", "Select")}
          </WindowsButton>
          <WindowsButton onClick={onClose}>{t("common.cancel", "Abbrechen")}</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <WinInput value={path} readOnly className="font-mono text-xs" />

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="h-64 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.parentPath !== null && data?.parentPath !== undefined && (
                <tr className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950" onClick={() => setPath(data.parentPath!)}>
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">..</td>
                </tr>
              )}
              {data?.entries.map((name) => (
                <tr
                  key={name}
                  className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  onClick={() => setPath(data.path === "/" ? `/${name}` : `${data.path}/${name}`)}
                >
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">📁 {name}</td>
                </tr>
              ))}
              {data && data.entries.length === 0 && (
                <tr>
                  <td className="px-2 py-4 text-center text-slate-400">{t("folderBrowser.empty", "No subfolders.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {creatingFolder ? (
          <div className="flex items-center gap-2">
            <WinInput
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t("folderBrowser.newFolderPlaceholder", "Folder name")}
            />
            <WindowsButton variant="primary" disabled={!newFolderName || createFolderMutation.isPending} onClick={() => createFolderMutation.mutate()}>
              {t("folderBrowser.createFolder", "Create")}
            </WindowsButton>
            <WindowsButton onClick={() => setCreatingFolder(false)}>{t("common.cancel", "Abbrechen")}</WindowsButton>
          </div>
        ) : (
          <button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setCreatingFolder(true)}>
            {t("folderBrowser.newFolder", "New Folder...")}
          </button>
        )}
      </div>
    </WindowsDialog>
  );
}
