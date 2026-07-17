import type ldap from "ldapjs";
import type { AdSite, AdSubnet, AdSiteLink } from "@samba-admin/shared";
import { search, add, modify, del, attrString, attrStringArray, buildChange } from "./ldapClient.js";

function configDn(domainDn: string): string {
  return `CN=Configuration,${domainDn}`;
}
function sitesDn(domainDn: string): string {
  return `CN=Sites,${configDn(domainDn)}`;
}
function subnetsDn(domainDn: string): string {
  return `CN=Subnets,${sitesDn(domainDn)}`;
}
function ipSiteLinksDn(domainDn: string): string {
  return `CN=IP,CN=Inter-Site Transports,${sitesDn(domainDn)}`;
}

export async function listSites(client: ldap.Client, domainDn: string): Promise<AdSite[]> {
  const entries = await search(client, sitesDn(domainDn), {
    scope: "one",
    filter: "(objectClass=site)",
    attributes: ["name", "description"],
  });
  return Promise.all(
    entries.map(async (entry) => {
      const serverEntries = await search(client, `CN=Servers,${entry.dn}`, {
        scope: "one",
        filter: "(objectClass=server)",
        attributes: ["cn"],
      }).catch(() => []);
      return {
        dn: entry.dn,
        name: attrString(entry.attributes, "name") ?? entry.dn,
        description: attrString(entry.attributes, "description"),
        servers: serverEntries.map((s) => attrString(s.attributes, "cn") ?? s.dn),
      };
    })
  );
}

export async function createSite(client: ldap.Client, domainDn: string, name: string, description?: string): Promise<string> {
  const dn = `CN=${name},${sitesDn(domainDn)}`;
  await add(client, dn, { objectClass: ["top", "site"], description });
  // Real dssite.msc always creates the two standard child containers alongside a new site.
  await add(client, `CN=Servers,${dn}`, { objectClass: ["top", "serversContainer"] });
  await add(client, `CN=NTDS Site Settings,${dn}`, { objectClass: ["top", "nTDSSiteSettings"] });
  return dn;
}

export async function deleteSite(client: ldap.Client, dn: string): Promise<void> {
  await del(client, `CN=NTDS Site Settings,${dn}`).catch(() => {});
  await del(client, `CN=Servers,${dn}`).catch(() => {});
  await del(client, dn);
}

export async function listSubnets(client: ldap.Client, domainDn: string): Promise<AdSubnet[]> {
  const entries = await search(client, subnetsDn(domainDn), {
    scope: "one",
    filter: "(objectClass=subnet)",
    attributes: ["name", "siteObject", "description"],
  });
  return entries.map((entry) => ({
    dn: entry.dn,
    name: attrString(entry.attributes, "name") ?? entry.dn,
    siteDn: attrString(entry.attributes, "siteObject"),
    description: attrString(entry.attributes, "description"),
  }));
}

export async function createSubnet(client: ldap.Client, domainDn: string, name: string, siteDn: string | undefined, description?: string): Promise<string> {
  const dn = `CN=${name},${subnetsDn(domainDn)}`;
  await add(client, dn, { objectClass: ["top", "subnet"], siteObject: siteDn, description });
  return dn;
}

export async function updateSubnetSite(client: ldap.Client, dn: string, siteDn: string | null): Promise<void> {
  await modify(client, dn, [siteDn ? buildChange("replace", "siteObject", siteDn) : buildChange("delete", "siteObject", [])]);
}

export async function deleteSubnet(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}

export async function listSiteLinks(client: ldap.Client, domainDn: string): Promise<AdSiteLink[]> {
  const entries = await search(client, ipSiteLinksDn(domainDn), {
    scope: "one",
    filter: "(objectClass=siteLink)",
    attributes: ["name", "siteList", "cost", "replInterval", "description"],
  });
  return entries.map((entry) => ({
    dn: entry.dn,
    name: attrString(entry.attributes, "name") ?? entry.dn,
    siteDns: attrStringArray(entry.attributes, "siteList"),
    cost: Number(attrString(entry.attributes, "cost") ?? "100"),
    replicationIntervalMinutes: Number(attrString(entry.attributes, "replInterval") ?? "180"),
    description: attrString(entry.attributes, "description"),
  }));
}

export async function createSiteLink(
  client: ldap.Client,
  domainDn: string,
  name: string,
  siteDns: string[],
  cost: number,
  replicationIntervalMinutes: number
): Promise<string> {
  const dn = `CN=${name},${ipSiteLinksDn(domainDn)}`;
  await add(client, dn, {
    objectClass: ["top", "siteLink"],
    siteList: siteDns,
    cost: String(cost),
    replInterval: String(replicationIntervalMinutes),
  });
  return dn;
}

export async function updateSiteLink(
  client: ldap.Client,
  dn: string,
  updates: { siteDns?: string[]; cost?: number; replicationIntervalMinutes?: number }
): Promise<void> {
  const changes: ldap.Change[] = [];
  if (updates.siteDns !== undefined) changes.push(buildChange("replace", "siteList", updates.siteDns));
  if (updates.cost !== undefined) changes.push(buildChange("replace", "cost", String(updates.cost)));
  if (updates.replicationIntervalMinutes !== undefined) changes.push(buildChange("replace", "replInterval", String(updates.replicationIntervalMinutes)));
  if (changes.length > 0) await modify(client, dn, changes);
}

export async function deleteSiteLink(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}
