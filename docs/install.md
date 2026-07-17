# Installation

This app turns a bare Debian or Ubuntu server into a Samba Active Directory
Domain Controller via a browser wizard, then provides a web UI to manage
users/groups/OUs/computers (an "Active Directory Users and Computers"
equivalent). It runs **on the target server itself** as a root-privileged
systemd service — there is no separate controller machine.

## Requirements

- A fresh Debian 12 (bookworm) or Ubuntu 22.04/24.04 server, reachable over
  the network, with nothing already listening on the ports Samba's AD DC
  role needs (53, 88, 135, 137-139, 389, 445, 464, 636, 3268-3269, and a
  dynamic RPC range — the wizard's preflight step checks for conflicts, most
  notably `systemd-resolved` holding port 53).
- Root/sudo access on that server.
- A workstation with a browser to drive the wizard (no client software
  needed there).

## Build & install

On the target server (or build elsewhere and copy the checkout over):

```sh
git clone <this-repo> samba-admin-webapp
cd samba-admin-webapp
npm install
npm run build
sudo ./packaging/install.sh
```

`install.sh`:
- installs Node.js and `openssl` if not already present,
- copies the built app to `/opt/samba-admin-webapp`,
- installs and starts the `samba-admin-webapp` systemd service.

## First run

Open `https://<server-ip>:8443` in a browser. The certificate is a
self-signed one generated on first boot — the browser will warn about this
once; this is expected for a LAN appliance (the same experience as
Cockpit/Proxmox/iDRAC). Plain HTTP (port 8080) redirects to HTTPS
automatically; credentials are never accepted over plaintext.

The wizard runs once:

1. **Packages** — detects Debian vs Ubuntu, runs preflight checks (DNS port
   conflicts, hostname/hosts sanity, time sync, firewall), then installs the
   Samba AD DC package set.
2. **Provisioning** — collect realm, NetBIOS domain name, administrator
   password, and domain function level, then runs `samba-tool domain
   provision` and the required post-steps (service masking, krb5.conf,
   DNS resolution, verification).
3. **Finish** — summary, optional reboot, then redirects to the login page.

After that, log in with the Domain Administrator account to reach the
management UI. Re-running the wizard is blocked once a domain has been
provisioned (replaying it would destroy the domain) — the API returns `409`
and the frontend routes straight to the login page.

## Operating notes

- Logs: apt/provisioning job output is under
  `/var/log/samba-admin-webapp/jobs/`; directory mutations (create/edit/
  delete/move on users, groups, OUs, computers) are audited to
  `/var/log/samba-admin-webapp/audit.log`.
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
