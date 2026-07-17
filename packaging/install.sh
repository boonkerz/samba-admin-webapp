#!/usr/bin/env bash
# Installs the Samba AD DC setup wizard / management web app as a systemd
# service. Run as root, from within an extracted
# samba-admin-webapp-<version>-linux-x64.tar.gz release built by
# packaging/build-binary.sh — the app itself ships as a single self-contained
# executable (Node "Single Executable Application"), so no Node.js/npm
# install or internet access is needed on this machine to run it.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "This installer must be run as root (it installs a systemd service)." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="/opt/samba-admin-webapp"

if [[ ! -x "$REPO_DIR/samba-admin-webapp" || ! -f "$REPO_DIR/frontend/dist/index.html" ]]; then
  echo "Release contents not found. Run this from within an extracted samba-admin-webapp-*.tar.gz built by packaging/build-binary.sh." >&2
  exit 1
fi

echo "==> Ensuring prerequisites (openssl, cabextract, libatomic1, unzip) are installed..."
NEED_UPDATE=0
for bin_pkg in openssl:openssl cabextract:cabextract unzip:unzip; do
  bin="${bin_pkg%%:*}"
  pkg="${bin_pkg##*:}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    [[ $NEED_UPDATE -eq 0 ]] && { apt-get update; NEED_UPDATE=1; }
    apt-get install -y --no-install-recommends "$pkg"
  fi
done
# libatomic1 is a shared library, not a binary — no `command -v` equivalent, so
# check via ldconfig. The official Node.js binary this app's SEA executable is
# built from links against libatomic.so.1; a bare Debian install doesn't have
# it, only glibc/gcc-using packages that happen to pull it in do.
if ! ldconfig -p | grep -q 'libatomic\.so\.1'; then
  [[ $NEED_UPDATE -eq 0 ]] && { apt-get update; NEED_UPDATE=1; }
  apt-get install -y --no-install-recommends libatomic1
fi
# olefile is a Python module, not a binary — check it separately. Needed to
# unpack the Microsoft ADMX MSI below; `pip install` isn't reliable across
# distros (no pip3, externally-managed-environment restrictions), so use apt.
if ! python3 -c "import olefile" >/dev/null 2>&1; then
  [[ $NEED_UPDATE -eq 0 ]] && { apt-get update; NEED_UPDATE=1; }
  apt-get install -y --no-install-recommends python3-olefile
fi

echo "==> Copying application to $INSTALL_DIR..."
# On a redeploy the service is still running the old binary — overwriting it
# in place fails with "Text file busy" (the running process has it mapped).
# Stop first, copy, then start again later once the systemd unit is (re)installed.
if systemctl is-active --quiet samba-admin-webapp 2>/dev/null; then
  systemctl stop samba-admin-webapp
fi
mkdir -p "$INSTALL_DIR"
# Copy to a temp file then rename — rename is atomic even if a lingering
# process still somehow has the old inode open.
cp "$REPO_DIR/samba-admin-webapp" "$INSTALL_DIR/samba-admin-webapp.new"
chmod +x "$INSTALL_DIR/samba-admin-webapp.new"
mv -f "$INSTALL_DIR/samba-admin-webapp.new" "$INSTALL_DIR/samba-admin-webapp"
rm -rf "$INSTALL_DIR/frontend" "$INSTALL_DIR/scripts"
cp -r "$REPO_DIR/frontend" "$INSTALL_DIR/frontend"
cp -r "$REPO_DIR/scripts" "$INSTALL_DIR/scripts"

echo "==> Initializing ADMX PolicyDefinitions for GPO editor..."
# Auto-detect domain from Samba config
DOMAIN=$(samba-tool domain level show 2>/dev/null | grep "DNS domain" | awk '{print $NF}' || echo "")
if [[ -z "$DOMAIN" ]]; then
  # Try to detect from smb.conf
  DOMAIN=$(grep -i "realm" /etc/samba/smb.conf 2>/dev/null | head -1 | awk '{print tolower($NF)}' || echo "")
fi
if [[ -z "$DOMAIN" ]]; then
  # Try to detect from SYSVOL
  DOMAIN=$(ls /var/lib/samba/sysvol/ 2>/dev/null | grep -v "^\." | head -1 || echo "")
fi
ADMX_CACHE_FILE="/var/lib/samba/sysvol/$DOMAIN/PolicyDefinitions/admx-cache.json"

if [[ -n "$DOMAIN" && -f "$ADMX_CACHE_FILE" && "${FORCE_ADMX_REINIT:-0}" != "1" ]]; then
  echo "ADMX templates already initialized (found $ADMX_CACHE_FILE) — skipping re-init on redeploy."
  echo "This step only runs on first install; it would otherwise overwrite any real Microsoft"
  echo "ADMX files sharing a name with our own bootstrap templates on every redeploy."
  echo "Set FORCE_ADMX_REINIT=1 to force a clean rebuild instead."
elif [[ -n "$DOMAIN" ]]; then
  echo "Detected domain: $DOMAIN"

  # Install basic ADMX templates first
  python3 "$REPO_DIR/packaging/init-admx-full.py" "$DOMAIN"

  # Extract and install Microsoft ADMX from MSI if available
  MSI_FILE=$(ls "$REPO_DIR/packaging/"*.msi 2>/dev/null | head -1)
  if [[ -n "$MSI_FILE" ]]; then
    echo "Extracting Microsoft ADMX templates from MSI..."
    TMPDIR=$(mktemp -d)

    # Extract CAB from MSI and install ADMX files. Non-fatal on failure —
    # the basic bootstrap templates from init-admx-full.py above still work.
    python3 << PYEOF || echo "  Warning: MSI extraction failed; continuing with bootstrap ADMX templates only."
import olefile
import os
import subprocess
import shutil
import re
import tempfile

msi_file = "$MSI_FILE"
domain = "$DOMAIN"
sysvol_base = "/var/lib/samba/sysvol"
target_dir = os.path.join(sysvol_base, domain, "PolicyDefinitions")

try:
    ole = olefile.OleFileIO(msi_file)
    
    # Find CAB stream
    for stream in ole.listdir():
        name = '/'.join(stream)
        data = ole.openstream(stream).read()
        
        if data[:4] == b'MSCF':
            # Extract CAB to temp file
            with tempfile.NamedTemporaryFile(suffix='.cab', delete=False) as tmp:
                tmp.write(data)
                cab_path = tmp.name
            
            # Extract with cabextract
            extract_dir = tempfile.mkdtemp()
            r = subprocess.run(['cabextract', '-d', extract_dir, cab_path], capture_output=True, text=True)
            
            if r.returncode == 0:
                # Install ADMX files
                admx_count = 0
                for f in os.listdir(extract_dir):
                    if f.endswith('.admx') and 'staging_' in f:
                        new_name = f.replace('staging_', '', 1)
                        src = os.path.join(extract_dir, f)
                        dst = os.path.join(target_dir, new_name)
                        shutil.copy2(src, dst)
                        admx_count += 1
                
                # Install ADML files (en-US and de-DE)
                lang_map = {
                    'en_US': 'en-US', 'de_DE': 'de-DE', 'en_us': 'en-US', 'de_de': 'de-DE',
                }
                
                adml_count = 0
                for f in os.listdir(extract_dir):
                    if f.endswith('.adml') and 'staging_' in f:
                        match = re.match(r'staging_([a-z]{2}_[A-Z]{2})_(.+)', f)
                        if not match:
                            match = re.match(r'staging_([a-z]{2}_[a-z]{2})_(.+)', f)
                        if match:
                            lang_code = match.group(1)
                            filename = match.group(2)
                            lang_dir = lang_map.get(lang_code, lang_code)
                            lang_path = os.path.join(target_dir, lang_dir)
                            os.makedirs(lang_path, exist_ok=True)
                            src = os.path.join(extract_dir, f)
                            dst = os.path.join(lang_path, filename)
                            shutil.copy2(src, dst)
                            adml_count += 1
                
                print(f"  Installed {admx_count} ADMX and {adml_count} ADML files from Microsoft")
            
            # Cleanup
            os.unlink(cab_path)
            shutil.rmtree(extract_dir)
            break
    
    ole.close()
except Exception as e:
    print(f"  Warning: Could not extract MSI: {e}")
PYEOF
  fi
  
  # Set permissions
  chown -R "BUILTIN\\administrators:BUILTIN\\administrators" "/var/lib/samba/sysvol/$DOMAIN/PolicyDefinitions" 2>/dev/null || true
  chmod -R 775 "/var/lib/samba/sysvol/$DOMAIN/PolicyDefinitions" 2>/dev/null || true
  
  # Build ADMX cache for fast loading
  echo "Building ADMX cache..."
  cp "$REPO_DIR/packaging/build-admx-cache.py" /tmp/build-admx-cache.py
  python3 /tmp/build-admx-cache.py "$DOMAIN"
  rm -f /tmp/build-admx-cache.py
else
  echo "Warning: Could not detect domain. ADMX templates not installed."
  echo "Run manually: python3 $REPO_DIR/packaging/init-admx-full.py <your-domain>"
fi

echo "==> Installing systemd unit..."
install -m 0644 "$REPO_DIR/packaging/samba-admin-webapp.service" /etc/systemd/system/samba-admin-webapp.service
systemctl daemon-reload
systemctl enable samba-admin-webapp
# `enable --now` only starts a not-yet-running unit; on a redeploy the
# service is already active and needs an explicit restart to load new code.
systemctl restart samba-admin-webapp

echo "==> Done. Open https://<this-server-ip>:8443 in a browser to continue."
