# Installation

This app turns a bare Debian or Ubuntu server into a Samba Active Directory
Domain Controller via a browser wizard, then provides a web UI to manage it
(an "Active Directory Users and Computers" / "Group Policy Management
Console" / "DNS Manager" equivalent). It runs **on the target server
itself** as a root-privileged systemd service — there is no separate
controller machine.

It ships as a single self-contained executable (a Node.js
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)).
**The target server needs neither Node.js nor npm, nor internet access** —
only a build machine does.

## Requirements

Target server:

- A fresh Debian 12/13 (bookworm/trixie) or Ubuntu 22.04/24.04 server,
  `linux-x64`, reachable over the network, with nothing already listening on
  the ports Samba's AD DC role needs (53, 88, 135, 137-139, 389, 445, 464,
  636, 3268-3269, and a dynamic RPC range — the wizard's preflight step
  checks for conflicts, most notably `systemd-resolved` holding port 53).
- Root/sudo access.
- Internet access to install Debian/Ubuntu packages via `apt` (Samba itself,
  CUPS if you enable the print server, a handful of small utilities) — the
  app binary itself needs none.

Build machine (your own workstation, or CI):

- Node.js 20+ and npm.
- A workstation with a browser to drive the wizard once the server is up
  (no client software needed there).

## Build & install

On your build machine:

```sh
git clone <this-repo> samba-admin-webapp
cd samba-admin-webapp
npm install
npm run build
bash packaging/build-binary.sh
```

This produces `dist/samba-admin-webapp-<version>-linux-x64.tar.gz` —
the compiled binary plus the frontend assets and a few helper scripts.
Copy it to the target server, extract it, and run the installer:

```sh
scp dist/samba-admin-webapp-*-linux-x64.tar.gz root@<server>:/tmp/
ssh root@<server>
tar -xzf /tmp/samba-admin-webapp-*-linux-x64.tar.gz -C /tmp/samba-admin-webapp-extract
cd /tmp/samba-admin-webapp-extract
bash packaging/install.sh
```

`install.sh`:
- installs a small set of OS package dependencies (`openssl`, `cabextract`,
  `unzip`, `python3-olefile`, `libatomic1`) if not already present — never
  Node.js/npm,
- copies the binary + frontend assets + scripts to `/opt/samba-admin-webapp`,
- initializes the Group Policy ADMX Central Store under SYSVOL on first
  install,
- installs and starts the `samba-admin-webapp` systemd service.

Re-running `install.sh` (e.g. after `build-binary.sh` on a newer checkout)
safely redeploys the binary in place and restarts the service.

### Optional: real Microsoft ADMX templates

By default the app seeds a small bootstrap set of Administrative Templates.
To get Microsoft's actual, complete ADMX/ADML set, download "Administrative
Templates (.admx) for Windows" from Microsoft and drop the `.msi` file into
`packaging/` on your build machine before running `build-binary.sh` — it
gets extracted automatically on first install. This file is Microsoft's own
copyrighted download and is intentionally not included in this repo; the
app works fine without it, and you can also import third-party template
bundles (Chrome, Adobe, ...) later, straight from the Group Policy Editor's
"Administrative Templates" node.

## First run

Open `https://<server-ip>:8443` in a browser. The certificate is a
self-signed one generated on first boot — the browser will warn about this
once; this is expected for a LAN appliance (the same experience as
Cockpit/Proxmox/iDRAC). Plain HTTP (port 8080) redirects to HTTPS
automatically; credentials are never accepted over plaintext.

The wizard runs once:

1. **Packages** — detects Debian vs Ubuntu, runs preflight checks (DNS port
   conflicts, hostname/hosts sanity, time sync, firewall), then installs the
   Samba AD DC package set, with an optional prompt to also set up the CUPS
   print server.
2. **Provisioning** — collect realm, NetBIOS domain name, and administrator
   password, then runs `samba-tool domain provision` and the required
   post-steps (service masking, krb5.conf, DNS resolution incl. a fallback
   nameserver so the box keeps working even if internal DNS hiccups,
   verification).
3. **Finish** — summary, optional reboot, then redirects to the login page.

After that, log in with the Domain Administrator account to reach the
management UI. Re-running the wizard is blocked once a domain has been
provisioned (replaying it would destroy the domain) — the API returns `409`
and the frontend routes straight to the login page.

## Operating notes

- Logs: apt/provisioning job output is under
  `/var/log/samba-admin-webapp/jobs/`; directory mutations (create/edit/
  delete/move on users, groups, OUs, computers, GPOs, printers, ...) are
  audited to `/var/log/samba-admin-webapp/audit.log` and viewable from the
  app's Audit Log page.
- State: the provisioning marker lives at
  `/var/lib/samba-admin-webapp/provisioned.json`.
- Config/secrets: `/etc/samba-admin-webapp/` holds the session cookie
  secret, the credential-encryption key, and the generated TLS cert/key —
  all root-only (mode 600/700).
- Service: `systemctl status samba-admin-webapp` /
  `journalctl -u samba-admin-webapp -f`.

## Known limitation

This project depends on `ldapjs` for all AD-over-LDAP operations (search,
add, modify, move, delete). Upstream `ldapjs` has been archived/decommissioned
by its maintainers; it still functions correctly (it's a stable, complete
LDAPv3 client), but it will not receive further upstream updates. If this
becomes a maintenance concern, the only usage surface is
`backend/src/directory/ldapClient.ts`, which would need a replacement client
behind the same small function set (`search`/`add`/`modify`/`modifyDn`/`del`).
