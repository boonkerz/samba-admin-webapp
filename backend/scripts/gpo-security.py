#!/usr/bin/env python3
"""
Reads/writes the nTSecurityDescriptor (DACL) of a GPO's AD object, converting
to/from SDDL text so the Node backend never has to parse the raw NT security
descriptor binary format itself — only Samba's own trusted
samba.dcerpc.security bindings touch the binary representation.

Usage:
  gpo-security.py get <gpo_dn>          Prints the GPO's SDDL to stdout.
  gpo-security.py set <gpo_dn>          Reads a new SDDL string from stdin,
                                        writes it back to nTSecurityDescriptor.

Runs as root against the local sam.ldb directly (same access pattern as
`samba-tool ntacl sysvolreset` and this app's other direct-DB operations) —
no domain credentials required.
"""
import sys

import ldb
import samba.auth
import samba.param
import samba.samdb
from samba.dcerpc import security
from samba.ndr import ndr_pack, ndr_unpack


def open_samdb():
    lp = samba.param.LoadParm()
    lp.load_default()
    return samba.samdb.SamDB(url="/var/lib/samba/private/sam.ldb", lp=lp, session_info=samba.auth.system_session(lp))


def get_sddl(samdb, gpo_dn):
    res = samdb.search(base=gpo_dn, scope=ldb.SCOPE_BASE, attrs=["nTSecurityDescriptor"])
    if not res or "nTSecurityDescriptor" not in res[0]:
        raise RuntimeError(f"No nTSecurityDescriptor found on {gpo_dn}")
    raw = res[0]["nTSecurityDescriptor"][0]
    sd = ndr_unpack(security.descriptor, raw)
    domain_sid = security.dom_sid(samdb.get_domain_sid())
    return sd.as_sddl(domain_sid)


def set_sddl(samdb, gpo_dn, sddl):
    domain_sid = security.dom_sid(samdb.get_domain_sid())
    sd = security.descriptor.from_sddl(sddl, domain_sid)
    raw = ndr_pack(sd)
    m = ldb.Message()
    m.dn = ldb.Dn(samdb, gpo_dn)
    m["nTSecurityDescriptor"] = ldb.MessageElement([raw], ldb.FLAG_MOD_REPLACE, "nTSecurityDescriptor")
    samdb.modify(m)


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("get", "set"):
        print("Usage: gpo-security.py get|set <gpo_dn>", file=sys.stderr)
        sys.exit(2)

    mode, gpo_dn = sys.argv[1], sys.argv[2]
    samdb = open_samdb()

    if mode == "get":
        print(get_sddl(samdb, gpo_dn))
    else:
        sddl = sys.stdin.read().strip()
        set_sddl(samdb, gpo_dn, sddl)


if __name__ == "__main__":
    main()
