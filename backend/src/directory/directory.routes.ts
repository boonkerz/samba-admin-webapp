import { Router } from "express";
import type {
  CreateGroupRequest,
  CreateOuRequest,
  CreateUserRequest,
  DirectoryObjectType,
  GpoDelegationPermission,
  GpoStatus,
  MoveObjectRequest,
  CreatePsoRequest,
  UpdatePsoRequest,
  GpoAdvancedRightsFlags,
} from "@samba-admin/shared";
import { attachLdapClient } from "./requestClient.middleware.js";
import { getTreeRoot, getTreeChildren, createOu, deleteOu } from "./ou.service.js";
import { listObjects, getObject, moveObject, searchObjects } from "./objects.service.js";
import { getUser, createUser, updateUser, setUserEnabled, resetUserPassword, deleteUser } from "./user.service.js";
import { getGroup, createGroup, updateGroup, deleteGroup, addGroupMember, removeGroupMember } from "./group.service.js";
import { getComputer, updateComputer, setComputerEnabled, renameComputer, deleteComputer } from "./computer.service.js";
import { getGpoLinks, listGpos, getDomainInfo, getOuTree } from "./gpo.service.js";
import { getGpoScopeLinks, createGpoLink, updateGpoLink, deleteGpoLink } from "../gpo/gpo-scope.service.js";
import { getGpoSecurityPrincipals, addSecurityFilterPrincipal, removeSecurityFilterPrincipal } from "../gpo/gpo-security.service.js";
import { getGpoDelegation, addDelegationPrincipal, updateDelegationPermission, removeDelegationPrincipal } from "../gpo/gpo-delegation.service.js";
import { getGpoAdvancedSecurity, setGpoAdvancedPermission, removeGpoAdvancedPrincipal } from "../gpo/gpo-advanced-security.service.js";
import {
  getGpoDetails,
  setGpoStatus,
  listWmiFilters,
  setGpoWmiFilter,
  getGpoSettingsSummary,
  createWmiFilter,
  deleteWmiFilter,
} from "../gpo/gpo-details.service.js";
import { listPsos, createPso, updatePso, deletePso, addPsoAppliesTo, removePsoAppliesTo } from "./pso.service.js";
import { modelGpoResults } from "../gpo/gpo-modeling.service.js";
import { auditLog, listAuditLog, getAuditLogFacets } from "./audit.js";
import { getServerHealth } from "./health.service.js";

export const directoryRouter = Router();

directoryRouter.use(attachLdapClient);

function actor(req: import("express").Request): string {
  return req.session.username ?? "unknown";
}

directoryRouter.get("/tree", async (req, res, next) => {
  try {
    const showAdvanced = req.query.advanced === "1";
    res.json(await getTreeRoot(req.ldapClient!, req.baseDn!, showAdvanced));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/tree/:dn/children", async (req, res, next) => {
  try {
    const showAdvanced = req.query.advanced === "1";
    res.json(await getTreeChildren(req.ldapClient!, decodeURIComponent(req.params.dn), showAdvanced));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/objects", async (req, res, next) => {
  try {
    const parentDn = String(req.query.parentDn ?? req.baseDn);
    const type = req.query.type as DirectoryObjectType | "all" | undefined;
    res.json(await listObjects(req.ldapClient!, parentDn, type && type !== "all" ? type : undefined));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/objects/:dn", async (req, res, next) => {
  try {
    const object = await getObject(req.ldapClient!, decodeURIComponent(req.params.dn));
    if (!object) return res.status(404).json({ error: "not-found", message: "Object not found." });
    res.json(object);
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/search", async (req, res, next) => {
  try {
    const type = req.query.type as DirectoryObjectType | undefined;
    res.json(await searchObjects(req.ldapClient!, req.baseDn!, String(req.query.q ?? ""), type));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/move", async (req, res, next) => {
  try {
    const body = req.body as MoveObjectRequest;
    const newDn = await moveObject(req.ldapClient!, body.dn, body.newParentDn);
    auditLog(actor(req), "move", body.dn, `-> ${body.newParentDn}`);
    res.json({ dn: newDn });
  } catch (err) {
    next(err);
  }
});

// --- Users ---
directoryRouter.get("/users/:dn", async (req, res, next) => {
  try {
    const user = await getUser(req.ldapClient!, decodeURIComponent(req.params.dn), req.baseDn);
    if (!user) return res.status(404).json({ error: "not-found", message: "User not found." });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/users", async (req, res, next) => {
  try {
    const body = req.body as CreateUserRequest;
    const dn = await createUser(req.ldapClient!, body);
    auditLog(actor(req), "create-user", dn);
    res.json(await getUser(req.ldapClient!, dn));
  } catch (err) {
    next(err);
  }
});

directoryRouter.patch("/users/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await updateUser(req.ldapClient!, dn, req.body);
    auditLog(actor(req), "update-user", dn);
    res.json(await getUser(req.ldapClient!, dn));
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/users/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteUser(req.ldapClient!, dn);
    auditLog(actor(req), "delete-user", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/users/:dn/enable", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await setUserEnabled(req.ldapClient!, dn, true);
    auditLog(actor(req), "enable-user", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/users/:dn/disable", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await setUserEnabled(req.ldapClient!, dn, false);
    auditLog(actor(req), "disable-user", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/users/:dn/reset-password", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await resetUserPassword(req.ldapClient!, dn, req.body.newPassword);
    auditLog(actor(req), "reset-password", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Groups ---
directoryRouter.get("/groups/:dn", async (req, res, next) => {
  try {
    const group = await getGroup(req.ldapClient!, decodeURIComponent(req.params.dn));
    if (!group) return res.status(404).json({ error: "not-found", message: "Group not found." });
    res.json(group);
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/groups", async (req, res, next) => {
  try {
    const body = req.body as CreateGroupRequest;
    const dn = await createGroup(req.ldapClient!, body);
    auditLog(actor(req), "create-group", dn);
    res.json(await getGroup(req.ldapClient!, dn));
  } catch (err) {
    next(err);
  }
});

directoryRouter.patch("/groups/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await updateGroup(req.ldapClient!, dn, req.body.description);
    auditLog(actor(req), "update-group", dn);
    res.json(await getGroup(req.ldapClient!, dn));
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/groups/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteGroup(req.ldapClient!, dn);
    auditLog(actor(req), "delete-group", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/groups/:dn/members", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await addGroupMember(req.ldapClient!, dn, req.body.memberDn);
    auditLog(actor(req), "add-group-member", dn, req.body.memberDn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/groups/:dn/members/:memberDn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    const memberDn = decodeURIComponent(req.params.memberDn);
    await removeGroupMember(req.ldapClient!, dn, memberDn);
    auditLog(actor(req), "remove-group-member", dn, memberDn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- OUs ---
directoryRouter.post("/ous", async (req, res, next) => {
  try {
    const body = req.body as CreateOuRequest;
    const dn = await createOu(req.ldapClient!, body.parentDn, body.name, body.description);
    auditLog(actor(req), "create-ou", dn);
    res.json({ dn });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/ous/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteOu(req.ldapClient!, dn);
    auditLog(actor(req), "delete-ou", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/ous/:dn/gpo-links", async (req, res, next) => {
  try {
    res.json(await getGpoLinks(req.ldapClient!, decodeURIComponent(req.params.dn)));
  } catch (err) {
    next(err);
  }
});

// --- Computers ---
directoryRouter.get("/computers/:dn", async (req, res, next) => {
  try {
    const computer = await getComputer(req.ldapClient!, decodeURIComponent(req.params.dn));
    if (!computer) return res.status(404).json({ error: "not-found", message: "Computer not found." });
    res.json(computer);
  } catch (err) {
    next(err);
  }
});

directoryRouter.patch("/computers/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await updateComputer(req.ldapClient!, dn, req.body);
    auditLog(actor(req), "update-computer", dn);
    res.json(await getComputer(req.ldapClient!, dn));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/computers/:dn/rename", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    const newDn = await renameComputer(req.ldapClient!, dn, req.body.newName);
    auditLog(actor(req), "rename-computer", dn, `-> ${req.body.newName}`);
    res.json({ dn: newDn });
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/computers/:dn/enable", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await setComputerEnabled(req.ldapClient!, dn, true);
    auditLog(actor(req), "enable-computer", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/computers/:dn/disable", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await setComputerEnabled(req.ldapClient!, dn, false);
    auditLog(actor(req), "disable-computer", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/computers/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteComputer(req.ldapClient!, dn);
    auditLog(actor(req), "delete-computer", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- GPO / Domain Info ---
directoryRouter.get("/domain", async (req, res, next) => {
  try {
    res.json(await getDomainInfo(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/gpos", async (req, res, next) => {
  try {
    res.json(await listGpos(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/ou-tree", async (req, res, next) => {
  try {
    res.json(await getOuTree(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

// --- GPO properties: Bereich (Scope) tab — links (reverse of /ous/:dn/gpo-links) ---

directoryRouter.get("/gpos/:guid/links", async (req, res, next) => {
  try {
    res.json(await getGpoScopeLinks(req.ldapClient!, req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/gpos/:guid/links", async (req, res, next) => {
  try {
    const { targetDn } = req.body as { targetDn: string };
    await createGpoLink(req.ldapClient!, req.baseDn!, req.params.guid, targetDn);
    auditLog(actor(req), "create-gpo-link", req.params.guid, targetDn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.put("/gpos/:guid/links/:targetDn", async (req, res, next) => {
  try {
    const targetDn = decodeURIComponent(req.params.targetDn);
    const { enforced, linkEnabled } = req.body as { enforced?: boolean; linkEnabled?: boolean };
    await updateGpoLink(req.ldapClient!, req.params.guid, targetDn, { enforced, linkEnabled });
    auditLog(actor(req), "update-gpo-link", req.params.guid, targetDn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/gpos/:guid/links/:targetDn", async (req, res, next) => {
  try {
    const targetDn = decodeURIComponent(req.params.targetDn);
    await deleteGpoLink(req.ldapClient!, req.params.guid, targetDn);
    auditLog(actor(req), "delete-gpo-link", req.params.guid, targetDn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- GPO properties: Bereich (Scope) tab — Sicherheitsfilterung ---

directoryRouter.get("/gpos/:guid/security-filtering", async (req, res, next) => {
  try {
    res.json(await getGpoSecurityPrincipals(req.ldapClient!, req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/gpos/:guid/security-filtering", async (req, res, next) => {
  try {
    const { sid } = req.body as { sid: string };
    if (!sid) throw new Error("Kein SID für das ausgewählte Objekt gefunden.");
    await addSecurityFilterPrincipal(req.baseDn!, req.params.guid, sid);
    auditLog(actor(req), "add-gpo-security-filter", req.params.guid, sid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/gpos/:guid/security-filtering/:sid", async (req, res, next) => {
  try {
    await removeSecurityFilterPrincipal(req.baseDn!, req.params.guid, req.params.sid);
    auditLog(actor(req), "remove-gpo-security-filter", req.params.guid, req.params.sid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- GPO properties: Delegierung (Delegation) tab ---

directoryRouter.get("/gpos/:guid/delegation", async (req, res, next) => {
  try {
    res.json(await getGpoDelegation(req.ldapClient!, req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/gpos/:guid/delegation", async (req, res, next) => {
  try {
    const { sid, permission } = req.body as { sid: string; permission: GpoDelegationPermission };
    if (!sid) throw new Error("Kein SID für das ausgewählte Objekt gefunden.");
    await addDelegationPrincipal(req.baseDn!, req.params.guid, sid, permission);
    auditLog(actor(req), "add-gpo-delegation", req.params.guid, sid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.put("/gpos/:guid/delegation/:sid", async (req, res, next) => {
  try {
    const { permission } = req.body as { permission: GpoDelegationPermission };
    await updateDelegationPermission(req.baseDn!, req.params.guid, req.params.sid, permission);
    auditLog(actor(req), "update-gpo-delegation", req.params.guid, req.params.sid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/gpos/:guid/delegation/:sid", async (req, res, next) => {
  try {
    await removeDelegationPrincipal(req.baseDn!, req.params.guid, req.params.sid);
    auditLog(actor(req), "remove-gpo-delegation", req.params.guid, req.params.sid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- GPO properties: Delegierung > "Erweitert..." (Advanced Security Settings) ---

directoryRouter.get("/gpos/:guid/advanced-security", async (req, res, next) => {
  try {
    res.json(await getGpoAdvancedSecurity(req.ldapClient!, req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

directoryRouter.put("/gpos/:guid/advanced-security/:sid", async (req, res, next) => {
  try {
    const { allow, deny } = req.body as { allow: GpoAdvancedRightsFlags; deny: GpoAdvancedRightsFlags };
    await setGpoAdvancedPermission(req.baseDn!, req.params.guid, req.params.sid, allow, deny);
    auditLog(actor(req), "update-gpo-advanced-security", req.params.guid, req.params.sid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/gpos/:guid/advanced-security/:sid", async (req, res, next) => {
  try {
    await removeGpoAdvancedPrincipal(req.baseDn!, req.params.guid, req.params.sid);
    auditLog(actor(req), "remove-gpo-advanced-security", req.params.guid, req.params.sid);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- GPO properties: Details tab ---

directoryRouter.get("/gpos/:guid/details", async (req, res, next) => {
  try {
    res.json(await getGpoDetails(req.ldapClient!, req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

directoryRouter.put("/gpos/:guid/status", async (req, res, next) => {
  try {
    const { status } = req.body as { status: GpoStatus };
    await setGpoStatus(req.ldapClient!, req.baseDn!, req.params.guid, status);
    auditLog(actor(req), "update-gpo-status", req.params.guid, status);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- GPO properties: Einstellungen (Settings) tab ---

directoryRouter.get("/gpos/:guid/settings-summary", async (req, res, next) => {
  try {
    res.json(await getGpoSettingsSummary(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

// --- WMI filters ---

directoryRouter.get("/wmi-filters", async (req, res, next) => {
  try {
    res.json(await listWmiFilters(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/wmi-filters", async (req, res, next) => {
  try {
    const { name, description, query, namespace } = req.body as {
      name?: string;
      description?: string;
      query?: string;
      namespace?: string;
    };
    if (!name || !query) return res.status(400).json({ error: "bad-request", message: "name and query required." });
    const dn = await createWmiFilter(req.ldapClient!, req.baseDn!, name, description ?? "", query, namespace);
    auditLog(actor(req), "create-wmi-filter", dn, name);
    res.status(201).json({ dn });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/wmi-filters/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteWmiFilter(req.ldapClient!, dn);
    auditLog(actor(req), "delete-wmi-filter", dn);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

directoryRouter.put("/gpos/:guid/wmi-filter", async (req, res, next) => {
  try {
    const { filterDn } = req.body as { filterDn: string | null };
    await setGpoWmiFilter(req.ldapClient!, req.baseDn!, req.params.guid, filterDn);
    auditLog(actor(req), "update-gpo-wmi-filter", req.params.guid, filterDn ?? "none");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Fine-Grained Password Policies (msDS-PasswordSettings) ---

directoryRouter.get("/psos", async (req, res, next) => {
  try {
    res.json(await listPsos(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/psos", async (req, res, next) => {
  try {
    const body = req.body as CreatePsoRequest;
    if (!body.name) return res.status(400).json({ error: "bad-request", message: "name required." });
    const dn = await createPso(req.ldapClient!, req.baseDn!, body);
    auditLog(actor(req), "create-pso", dn, body.name);
    res.status(201).json({ dn });
  } catch (err) {
    next(err);
  }
});

directoryRouter.put("/psos/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await updatePso(req.ldapClient!, dn, req.body as UpdatePsoRequest);
    auditLog(actor(req), "update-pso", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/psos/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deletePso(req.ldapClient!, dn);
    auditLog(actor(req), "delete-pso", dn);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

directoryRouter.post("/psos/:dn/applies-to", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    const { targetDn } = req.body as { targetDn?: string };
    if (!targetDn) return res.status(400).json({ error: "bad-request", message: "targetDn required." });
    await addPsoAppliesTo(req.ldapClient!, dn, targetDn);
    auditLog(actor(req), "add-pso-applies-to", dn, targetDn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

directoryRouter.delete("/psos/:dn/applies-to/:targetDn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    const targetDn = decodeURIComponent(req.params.targetDn);
    await removePsoAppliesTo(req.ldapClient!, dn, targetDn);
    auditLog(actor(req), "remove-pso-applies-to", dn, targetDn);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Gruppenrichtlinienmodellierung (GPO Modeling / RSoP simulation) ---

directoryRouter.get("/gpo-modeling", async (req, res, next) => {
  try {
    const targetDn = String(req.query.targetDn ?? "");
    const targetType = req.query.targetType === "computer" ? "computer" : "user";
    if (!targetDn) return res.status(400).json({ error: "bad-request", message: "targetDn required." });
    res.json(await modelGpoResults(req.ldapClient!, req.baseDn!, targetDn, targetType));
  } catch (err) {
    next(err);
  }
});

// --- Audit log ---

directoryRouter.get("/audit-log", (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 200;
    const actor = req.query.actor ? String(req.query.actor) : undefined;
    const operation = req.query.operation ? String(req.query.operation) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    res.json(listAuditLog({ limit, actor, operation, search }));
  } catch (err) {
    next(err);
  }
});

directoryRouter.get("/audit-log/facets", (_req, res, next) => {
  try {
    res.json(getAuditLogFacets());
  } catch (err) {
    next(err);
  }
});

// --- Server health dashboard ---

directoryRouter.get("/health", async (_req, res, next) => {
  try {
    res.json(await getServerHealth());
  } catch (err) {
    next(err);
  }
});
