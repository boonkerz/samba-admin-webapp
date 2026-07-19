/**
 * Minimal, dependency-free XML element parser/serializer for a bounded
 * subset: attributes and nested elements only — no CDATA, comments,
 * processing instructions, or namespaces. Every other GPP preference
 * service in this project parses XML by hand with regex, which works for
 * flat, single-level fragments but can't handle GPP's `<Filters>` block
 * correctly (it nests arbitrarily via `<FilterCollection>`). Rather than
 * add an external XML dependency for this one bounded need, or attempt to
 * regex nested XML (which cannot be done correctly in the general case),
 * this is a small real recursive-descent parser scoped to exactly what
 * GPP's Filters fragment needs.
 */
export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Parses zero or more sibling elements from a fragment of XML text (no single required root). */
export function parseXmlFragment(text: string): XmlElement[] {
  let pos = 0;

  function skipWs(): void {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  }

  function parseName(): string {
    const start = pos;
    while (pos < text.length && /[A-Za-z0-9_:.-]/.test(text[pos])) pos++;
    if (pos === start) throw new Error(`Expected an element/attribute name at position ${pos}`);
    return text.slice(start, pos);
  }

  function parseAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {};
    while (true) {
      skipWs();
      if (pos >= text.length || text[pos] === "/" || text[pos] === ">") break;
      const name = parseName();
      skipWs();
      if (text[pos] !== "=") throw new Error(`Expected '=' after attribute "${name}" at position ${pos}`);
      pos++;
      skipWs();
      const quote = text[pos];
      if (quote !== '"' && quote !== "'") throw new Error(`Expected a quoted attribute value at position ${pos}`);
      pos++;
      const valStart = pos;
      while (pos < text.length && text[pos] !== quote) pos++;
      const raw = text.slice(valStart, pos);
      pos++; // closing quote
      attrs[name] = unescapeXml(raw);
    }
    return attrs;
  }

  function parseElement(): XmlElement {
    pos++; // consume '<'
    const tag = parseName();
    const attrs = parseAttrs();
    skipWs();
    if (text[pos] === "/" && text[pos + 1] === ">") {
      pos += 2;
      return { tag, attrs, children: [] };
    }
    if (text[pos] !== ">") throw new Error(`Expected '>' closing <${tag}> at position ${pos}`);
    pos++;

    const children: XmlElement[] = [];
    while (true) {
      skipWs();
      if (pos >= text.length) throw new Error(`Unexpected end of input inside <${tag}>`);
      if (text[pos] === "<" && text[pos + 1] === "/") {
        pos += 2;
        const closeName = parseName();
        skipWs();
        if (text[pos] !== ">") throw new Error(`Expected '>' closing </${closeName}> at position ${pos}`);
        pos++;
        if (closeName !== tag) throw new Error(`Mismatched closing tag: expected </${tag}>, got </${closeName}>`);
        break;
      }
      if (text[pos] !== "<") {
        // No meaningful text content in GPP's Filters fragment — skip stray characters/whitespace.
        pos++;
        continue;
      }
      children.push(parseElement());
    }
    return { tag, attrs, children };
  }

  const roots: XmlElement[] = [];
  while (true) {
    skipWs();
    if (pos >= text.length) break;
    if (text[pos] !== "<") {
      pos++;
      continue;
    }
    roots.push(parseElement());
  }
  return roots;
}

export function serializeXmlElement(el: XmlElement): string {
  const attrStr = Object.entries(el.attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
  if (el.children.length === 0) return `<${el.tag}${attrStr}/>`;
  return `<${el.tag}${attrStr}>${el.children.map(serializeXmlElement).join("")}</${el.tag}>`;
}
