#!/usr/bin/env python3
"""
Pre-parse ADMX files and save as JSON cache for fast loading
"""

import os
import json
import re
import sys
from pathlib import Path

DOMAIN = sys.argv[1] if len(sys.argv) > 1 else "bsw.local"
SYSVOL_BASE = "/var/lib/samba/sysvol"
POLICY_DEFS = os.path.join(SYSVOL_BASE, DOMAIN, "PolicyDefinitions")
OUTPUT_FILE = os.path.join(POLICY_DEFS, "admx-cache.json")


def read_text_auto(path):
    """
    Reads an ADMX/ADML file, auto-detecting its encoding from a BOM the way
    Windows itself does. Microsoft's own templates are plain UTF-8, but real
    third-party bundles are not guaranteed to be — Google's official Chrome
    ADMX/ADML files, for example, ship as UTF-16LE with a BOM. Blindly
    opening every file as UTF-8 (the previous behavior) doesn't raise an
    error on such a file: each ASCII character decodes as itself followed by
    a stray NUL codepoint (U+0000 IS valid UTF-8), so every regex below that
    matches a literal tag name like "<category" silently matches nothing —
    the file parses "successfully" into zero categories/policies with no
    warning printed at all.
    """
    with open(path, "rb") as fh:
        raw = fh.read()
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16-le", errors="ignore")
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16-be", errors="ignore")
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig", errors="ignore")
    return raw.decode("utf-8", errors="ignore")

# Main categories that should appear at root level in GPO editor
MAIN_CATEGORIES = {
    "WindowsComponents": "Windows-Komponenten",
    "System": "System",
    "Network": "Netzwerk",
    "ControlPanel": "Systemsteuerung",
    "StartMenu": "Startmenü und Taskleiste",
    "Desktop": "Desktop",
    "WindowsUpdate": "Windows Update",
    "InternetExplorer": "Internet Explorer",
    "MicrosoftEdge": "Microsoft Edge",
    "RemoteDesktopServices": "Remotedesktopdienste",
    "WindowsDefender": "Windows Defender",
    "WindowsFirewall": "Windows-Firewall",
    "PowerManagement": "Energieverwaltung",
    "TaskScheduler": "Aufgabenplanung",
    "WindowsStore": "Microsoft Store",
    "OneDrive": "OneDrive",
    "Credentials": "Anmeldeinformationen",
    "Security": "Sicherheit",
    "TerminalServer": "Remotedesktopdienste",
}

# NOTE on a category that looks like it needs special-casing but doesn't:
# the top-level "Printers" ADMX category (Windows.admx, no parentCategory)
# has 45 real policies, all class="Machine" — real GPME shows it only under
# Computerkonfiguration, never Benutzerkonfiguration, even though nothing
# here marks it as machine-only; the category itself is scope-agnostic in
# the schema. That per-scope split is NOT a Python/cache-time concern — it's
# computed at request time in admx.service.ts (computeScopeFlags), from
# each policy's own `class` attribute, and applied per-request by the
# frontend depending on which config side (Computer/User) is being
# rendered. This script only decides whether a category is worth shipping
# to the cache at all (see has_policy_in_subtree below), not which scope(s)
# it belongs to.

def extract_attributes(tag_text):
    """
    Extract attributes from an XML tag's OWN opening tag only (up to its
    first unescaped '>') — never pass a whole multi-line block containing
    nested child elements. A flat regex scan over the full block would also
    pick up attributes from nested children (e.g. a <list key="..."/> inside
    a <policy>...</policy>), and since later matches overwrite earlier ones
    in the resulting dict, a child's own "key"/"name"/etc. would silently
    clobber the parent's same-named attribute.
    """
    opening_tag_end = tag_text.find(">")
    opening_tag = tag_text[: opening_tag_end + 1] if opening_tag_end != -1 else tag_text
    attrs = {}
    for match in re.finditer(r'(\w+)="([^"]*)"', opening_tag):
        attrs[match.group(1)] = match.group(2)
    return attrs

def parse_admx_simple(content):
    """Simple ADMX parser using regex (no XML dependency)"""
    categories = []
    policies = []
    
    # Remove XML comments
    content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
    
    # Find all category tags
    cat_pattern = re.compile(r'<category\s[^>]*?(?:/>|>.*?</category>)', re.DOTALL | re.IGNORECASE)
    
    for match in cat_pattern.finditer(content):
        tag = match.group(0)
        attrs = extract_attributes(tag)
        
        name = attrs.get("name")
        display_ref = attrs.get("displayName")
        
        if not name or not display_ref:
            continue
        
        # Extract display reference (remove $(...))
        display_match = re.search(r'\$\(([^)]+)\)', display_ref)
        if display_match:
            display_ref = display_match.group(1)
        
        # Find parentCategory - could be attribute or child element
        parent = attrs.get("parentCategory")
        if not parent:
            # Look for parentCategory child element
            parent_match = re.search(r'<parentCategory\s+ref="([^"]+)"', tag, re.IGNORECASE)
            if parent_match:
                parent = parent_match.group(1)
        
        if not any(c["name"] == name for c in categories):
            categories.append({
                "name": name,
                "displayName": display_ref,
                "parentCategory": parent,
                "children": [],
                "policies": []
            })
    
    # Find all policy tags
    policy_pattern = re.compile(r'<policy\s[^>]*?(?:/>|>.*?</policy>)', re.DOTALL | re.IGNORECASE)
    
    for match in policy_pattern.finditer(content):
        tag = match.group(0)
        attrs = extract_attributes(tag)
        
        name = attrs.get("name")
        policy_class = attrs.get("class")
        display_ref = attrs.get("displayName")
        key = attrs.get("key")
        value_name = attrs.get("valueName")
        explain_ref = attrs.get("explainText")
        
        if not name or not policy_class or not display_ref or not key or not value_name:
            continue
        
        # Extract display reference
        display_match = re.search(r'\$\(([^)]+)\)', display_ref)
        if display_match:
            display_ref = display_match.group(1)
        
        # Extract explainText reference
        if explain_ref:
            explain_match = re.search(r'\$\(([^)]+)\)', explain_ref)
            if explain_match:
                explain_ref = explain_match.group(1)
        
        # Find parentCategory - could be attribute or child element
        parent = attrs.get("parentCategory")
        if not parent:
            parent_match = re.search(r'<parentCategory\s+ref="([^"]+)"', tag, re.IGNORECASE)
            if parent_match:
                parent = parent_match.group(1)
        
        if any(p["name"] == name for p in policies):
            continue

        # Extract <enabledValue>/<disabledValue> — the literal value ADMX
        # says to write to key/valueName for the Enabled/Disabled radio
        # state. Most real Windows policies define these explicitly (often,
        # but not always, 1/0) rather than leaving it to be inferred.
        def extract_state_value(tag_text, tag_name):
            m = re.search(rf'<{tag_name}>(.*?)</{tag_name}>', tag_text, re.DOTALL | re.IGNORECASE)
            if not m:
                return None
            inner = m.group(1)
            dec = re.search(r'<decimal\s+value="(-?\d+)"', inner, re.IGNORECASE)
            if dec:
                return int(dec.group(1))
            s = re.search(r'<string>([^<]*)</string>', inner, re.IGNORECASE)
            if s:
                return s.group(1)
            return None

        enabled_value = extract_state_value(tag, "enabledValue")
        disabled_value = extract_state_value(tag, "disabledValue")

        # Extract elements (list, enum, text, decimal, boolean)
        elements = []
        
        # Find <elements> block
        elements_match = re.search(r'<elements>(.*?)</elements>', tag, re.DOTALL | re.IGNORECASE)
        if elements_match:
            elements_block = elements_match.group(1)
            
            # Extract list elements
            for list_match in re.finditer(r'<list\s[^>]*/?\s*>', elements_block, re.IGNORECASE):
                list_tag = list_match.group(0)
                list_attrs = extract_attributes(list_tag)
                elements.append({
                    "type": "list",
                    "id": list_attrs.get("id", ""),
                    "key": list_attrs.get("key"),
                    "explicitValue": list_attrs.get("explicitValue") == "true"
                })
            
            # Extract enum elements with items
            for enum_match in re.finditer(r'<enum\s+[^>]*?id="([^"]+)"[^>]*?valueName="([^"]+)"[^>]*?>(.*?)</enum>', elements_block, re.DOTALL | re.IGNORECASE):
                elem = {
                    "type": "enum",
                    "id": enum_match.group(1),
                    "valueName": enum_match.group(2),
                    "items": []
                }
                
                for item_match in re.finditer(r'<item\s+displayName="\$\(([^)]+)\)"[^>]*><value><decimal\s+value="(\d+)"\s*/></value></item>', enum_match.group(3), re.IGNORECASE):
                    elem["items"].append({
                        "displayName": item_match.group(1),
                        "value": int(item_match.group(2))
                    })
                
                elements.append(elem)
            
            # Extract text elements
            for text_match in re.finditer(r'<text\s+[^>]*?id="([^"]+)"[^>]*?valueName="([^"]+)"[^>]*/?\s*>', elements_block, re.IGNORECASE):
                elements.append({
                    "type": "text",
                    "id": text_match.group(1),
                    "valueName": text_match.group(2)
                })
            
            # Extract decimal elements
            for dec_match in re.finditer(r'<decimal\s+[^>]*?id="([^"]+)"[^>]*?valueName="([^"]+)"[^>]*?minValue="(\d+)"[^>]*?maxValue="(\d+)"[^>]*/?\s*>', elements_block, re.IGNORECASE):
                elements.append({
                    "type": "decimal",
                    "id": dec_match.group(1),
                    "valueName": dec_match.group(2),
                    "minValue": int(dec_match.group(3)),
                    "maxValue": int(dec_match.group(4))
                })
            
            # Extract boolean elements
            for bool_match in re.finditer(r'<boolean\s+[^>]*?id="([^"]+)"[^>]*?valueName="([^"]+)"[^>]*?>', elements_block, re.IGNORECASE):
                elements.append({
                    "type": "boolean",
                    "id": bool_match.group(1),
                    "valueName": bool_match.group(2)
                })
        
        policies.append({
            "name": name,
            "class": policy_class,
            "displayName": display_ref,
            "explainText": explain_ref,
            "key": key.replace('\\\\', '\\'),
            "valueName": value_name,
            "parentCategory": parent,
            "elements": elements,
            "enabledValue": enabled_value,
            "disabledValue": disabled_value
        })
    
    return categories, policies

def parse_adml_simple(content):
    """Parse ADML to get string translations"""
    strings = {}
    
    string_pattern = re.compile(
        r'<string\s+id="([^"]+)">([^<]+)</string>',
        re.IGNORECASE
    )
    
    for match in string_pattern.finditer(content):
        strings[match.group(1)] = match.group(2)
    
    return strings

def main():
    print(f"Parsing ADMX files from: {POLICY_DEFS}")
    
    if not os.path.exists(POLICY_DEFS):
        print(f"Error: PolicyDefinitions not found at {POLICY_DEFS}")
        sys.exit(1)
    
    # Parse all ADML files - prefer German, fallback to English
    all_strings = {}
    
    # Load English first as base
    en_us_dir = os.path.join(POLICY_DEFS, "en-US")
    if os.path.exists(en_us_dir):
        for f in os.listdir(en_us_dir):
            if f.endswith('.adml'):
                try:
                    content = read_text_auto(os.path.join(en_us_dir, f))
                    strings = parse_adml_simple(content)
                    all_strings.update(strings)
                except Exception as e:
                    pass
    
    # Override with German translations
    de_de_dir = os.path.join(POLICY_DEFS, "de-DE")
    if os.path.exists(de_de_dir):
        for f in os.listdir(de_de_dir):
            if f.endswith('.adml'):
                try:
                    content = read_text_auto(os.path.join(de_de_dir, f))
                    strings = parse_adml_simple(content)
                    all_strings.update(strings)  # German overrides English
                except Exception as e:
                    pass
    
    print(f"  Loaded {len(all_strings)} string translations (German preferred)")
    
    # Parse all ADMX files
    all_categories = []
    all_policies = []
    
    admx_files = [f for f in os.listdir(POLICY_DEFS) if f.endswith('.admx')]
    print(f"  Parsing {len(admx_files)} ADMX files...")
    
    for f in sorted(admx_files):
        try:
            content = read_text_auto(os.path.join(POLICY_DEFS, f))
            categories, policies = parse_admx_simple(content)

            # Helper to resolve string references
            def resolve_string(ref):
                if not ref:
                    return ref
                # Try direct lookup
                if ref in all_strings:
                    return all_strings[ref]
                # Try without "string." prefix
                if ref.startswith("string."):
                    key = ref[7:]  # Remove "string."
                    if key in all_strings:
                        return all_strings[key]
                return ref

            for cat in categories:
                cat["displayName"] = resolve_string(cat["displayName"])

            for pol in policies:
                pol["displayName"] = resolve_string(pol["displayName"])
                if pol.get("explainText"):
                    pol["explainText"] = resolve_string(pol["explainText"])

                for elem in pol.get("elements", []):
                    if elem.get("items"):
                        for item in elem["items"]:
                            item["displayName"] = resolve_string(item["displayName"])

            all_categories.extend(categories)
            all_policies.extend(policies)
        except Exception as e:
            print(f"  Warning: Could not parse {f}: {e}")
    
    print(f"  Found {len(all_categories)} categories, {len(all_policies)} policies")
    
    # Build parent-child relationships
    cat_map = {c["name"]: c for c in all_categories}
    
    for cat in all_categories:
        if cat["parentCategory"]:
            # Extract category name from "prefix:CategoryName"
            parent_name = cat["parentCategory"].split(":")[-1]
            if parent_name in cat_map:
                cat_map[parent_name]["children"].append(cat["name"])
                cat["parentCategory"] = parent_name
            else:
                cat["parentCategory"] = None
    
    # Assign policies to categories
    for pol in all_policies:
        if pol.get("parentCategory"):
            cat_name = pol["parentCategory"].split(":")[-1]
            pol["parentCategory"] = cat_name
            if cat_name in cat_map:
                cat_map[cat_name]["policies"].append(pol["name"])

    # A root category is worth shipping if it (or any descendant, anywhere
    # in its subtree) has at least one real policy — matching real GPME,
    # which never shows a category that would be empty on every config
    # side. This replaces an earlier arbitrary threshold ("main category or
    # >=3 children or >=5 policies") that both hid legitimate categories
    # with few policies (e.g. "SharedFolders"/Freigegebene Ordner) and had
    # no principled reason to require 3 or 5 of anything. Per-scope
    # (Computer vs. User) visibility is a separate, later concern — see the
    # note above; this only asks "does this category matter at all".
    _subtree_has_policy_memo = {}

    def has_policy_in_subtree(name):
        if name in _subtree_has_policy_memo:
            return _subtree_has_policy_memo[name]
        cat = cat_map.get(name)
        if not cat:
            return False
        _subtree_has_policy_memo[name] = False  # cycle guard
        result = len(cat.get("policies", [])) > 0 or any(
            has_policy_in_subtree(child) for child in cat.get("children", [])
        )
        _subtree_has_policy_memo[name] = result
        return result

    root_categories = []
    for cat in all_categories:
        if not cat["parentCategory"]:
            if has_policy_in_subtree(cat["name"]):
                root_categories.append(cat["name"])
                # Prefer the curated German name over a raw "string.X"
                # placeholder left behind by a failed ADML string lookup.
                if cat["name"] in MAIN_CATEGORIES and cat["displayName"].startswith("string."):
                    cat["displayName"] = MAIN_CATEGORIES[cat["name"]]
            else:
                cat["_hidden"] = True
    
    # Filter out hidden categories
    visible_categories = [c for c in all_categories if not c.get("_hidden")]
    
    print(f"  Visible root categories: {len(root_categories)}")
    for rc in root_categories[:15]:
        cat = cat_map[rc]
        children = len(cat.get("children", []))
        policies = len(cat.get("policies", []))
        print(f"    - {rc}: {cat['displayName']} ({children} children, {policies} policies)")
    
    # Build output
    output = {
        "categories": visible_categories,
        "policies": all_policies,
        "strings": all_strings,
        "stats": {
            "categoryCount": len(visible_categories),
            "policyCount": len(all_policies),
            "stringCount": len(all_strings),
            "rootCategoryCount": len(root_categories)
        }
    }
    
    # Save to JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as fh:
        json.dump(output, fh, ensure_ascii=False, indent=None)
    
    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"\nSaved cache to: {OUTPUT_FILE}")
    print(f"  File size: {file_size:,} bytes ({file_size/1024:.1f} KB)")

if __name__ == "__main__":
    main()
