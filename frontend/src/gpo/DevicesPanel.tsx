import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, DevicePreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";

const ACTION_LABELS: Record<DevicePreference["deviceAction"], string> = { ENABLE: "Aktivieren", DISABLE: "Deaktivieren" };

function DeviceDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: DevicePreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [deviceAction, setDeviceAction] = useState<DevicePreference["deviceAction"]>(item?.deviceAction ?? "DISABLE");
  const [deviceClass, setDeviceClass] = useState(item?.deviceClass ?? "");
  const [deviceType, setDeviceType] = useState(item?.deviceType ?? "");
  const [deviceClassGUID, setDeviceClassGUID] = useState(item?.deviceClassGUID ?? "");
  const [deviceTypeID, setDeviceTypeID] = useState(item?.deviceTypeID ?? "");

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/devices/${scope}/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/devices/${scope}`, body),
    onSuccess: () => {
      pushToast("success", item ? "Gerät aktualisiert." : "Gerät erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = deviceClassGUID.trim().length > 0 && deviceTypeID.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Geräteeinstellungen" : "Neue Eigenschaften für Geräteeinstellungen"}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                deviceAction,
                deviceClass: deviceClass || undefined,
                deviceType: deviceType || undefined,
                deviceClassGUID,
                deviceTypeID,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={deviceAction} onChange={(e) => setDeviceAction(e.target.value as DevicePreference["deviceAction"])}>
            <option value="ENABLE">Aktivieren</option>
            <option value="DISABLE">Deaktivieren</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Geräteklasse (Anzeige, optional):</WinLabel>
          <WinInput value={deviceClass} onChange={(e) => setDeviceClass(e.target.value)} placeholder="Diskettenlaufwerk-Controller" autoFocus />
        </div>
        <div>
          <WinLabel>Gerätetyp (Anzeige, optional):</WinLabel>
          <WinInput value={deviceType} onChange={(e) => setDeviceType(e.target.value)} placeholder="Standard-Diskettenlaufwerk-Controller" />
        </div>
        <div>
          <WinLabel>Geräteklassen-GUID:</WinLabel>
          <WinInput
            value={deviceClassGUID}
            onChange={(e) => setDeviceClassGUID(e.target.value)}
            placeholder="{4D36E969-E325-11CE-BFC1-08002BE10318}"
          />
        </div>
        <div>
          <WinLabel>Geräte-ID:</WinLabel>
          <WinInput value={deviceTypeID} onChange={(e) => setDeviceTypeID(e.target.value)} placeholder="ACPI\PNP0700\4&E5ACEE3&0" />
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Geräte list view. */
export function DevicesPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: DevicePreference }>();
  const [editing, setEditing] = useState<{ item?: DevicePreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-devices", gpo.guid, scope],
    queryFn: () => api.get<DevicePreference[]>(`/api/gpo/${gpo.guid}/devices/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-devices", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/devices/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Gerät gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: DevicePreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Geräteeinstellungen...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Geräteeinstellungen für "${menu.item!.deviceType || menu.item!.deviceClass || menu.item!.deviceTypeID}" wirklich löschen?`))
                deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Geräte</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Geräteeinstellungen für {scope === "machine" ? "Computer" : "Benutzer"}.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um Geräteeinstellungen hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Geräteklasse</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Gerätetyp</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.deviceClass || "—"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.deviceType || "—"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.deviceAction]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <DeviceDialog
          gpo={gpo}
          scope={scope}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
