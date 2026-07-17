/** Renders a DN as a human path like ADUC's "Erstellen in:" line, e.g. "bsw.local/Sales". */
export function dnToPath(dn: string): string {
  const parts = dn.split(",").map((p) => p.trim());
  const dcParts = parts.filter((p) => /^DC=/i.test(p)).map((p) => p.slice(p.indexOf("=") + 1));
  const otherParts = parts
    .filter((p) => !/^DC=/i.test(p))
    .map((p) => p.slice(p.indexOf("=") + 1))
    .reverse();
  return [dcParts.join("."), ...otherParts].filter(Boolean).join("/");
}

/** Extracts the leading RDN value from a DN, e.g. "CN=Philip Bluhm,OU=..." -> "Philip Bluhm". */
export function dnToCn(dn: string): string {
  const first = dn.split(",")[0] ?? dn;
  const eq = first.indexOf("=");
  return eq === -1 ? first : first.slice(eq + 1);
}
