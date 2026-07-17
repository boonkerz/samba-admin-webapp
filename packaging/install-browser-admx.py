#!/usr/bin/env python3
"""
Download and install Microsoft ADMX templates from working sources
"""

import os
import sys
import subprocess
import zipfile
import tempfile
import shutil

DOMAIN = sys.argv[1] if len(sys.argv) > 1 else "bsw.local"
SYSVOL_BASE = "/var/lib/samba/sysvol"
POLICY_DEFS = os.path.join(SYSVOL_BASE, DOMAIN, "PolicyDefinitions")

def run_cmd(cmd, check=True):
    """Run a command and return success/failure"""
    try:
        result = subprocess.run(cmd, shell=True, check=check, capture_output=True, text=True, timeout=300)
        return result.returncode == 0
    except:
        return False

def download_file(url, dest):
    """Download file using wget"""
    print(f"  Downloading: {url[:80]}...")
    return run_cmd(f'wget -q -O "{dest}" "{url}"', check=False)

def extract_zip(zip_path, extract_to):
    """Extract zip file"""
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(extract_to)
        return True
    except:
        return False

def main():
    print("=" * 60)
    print("Microsoft ADMX Template Installer")
    print("=" * 60)
    print(f"\nDomain: {DOMAIN}")
    print(f"Target: {POLICY_DEFS}\n")
    
    os.makedirs(os.path.join(POLICY_DEFS, "en-US"), exist_ok=True)
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Download Google Chrome ADMX
        print("[1/3] Google Chrome ADMX")
        chrome_zip = os.path.join(temp_dir, "chrome.zip")
        if download_file("https://dl.google.com/dl/edgedl/chrome/policy/policy_templates.zip", chrome_zip):
            chrome_dir = os.path.join(temp_dir, "chrome")
            os.makedirs(chrome_dir, exist_ok=True)
            if extract_zip(zip_path, chrome_dir):
                # Find and copy ADMX files
                for root, dirs, files in os.walk(chrome_dir):
                    for f in files:
                        if f.endswith('.admx'):
                            src = os.path.join(root, f)
                            dst = os.path.join(POLICY_DEFS, f)
                            shutil.copy2(src, dst)
                            print(f"    Installed: {f}")
                        elif f.endswith('.adml'):
                            src = os.path.join(root, f)
                            dst = os.path.join(POLICY_DEFS, "en-US", f)
                            shutil.copy2(src, dst)
                            print(f"    Installed: en-US/{f}")
        
        # Download Mozilla Firefox ADMX
        print("\n[2/3] Mozilla Firefox ADMX")
        firefox_zip = os.path.join(temp_dir, "firefox.zip")
        if download_file("https://github.com/nicedoc/nicedoc.io/raw/master/firefox/admx/firefox_admx.zip", firefox_zip):
            firefox_dir = os.path.join(temp_dir, "firefox")
            os.makedirs(firefox_dir, exist_ok=True)
            if extract_zip(firefox_zip, firefox_dir):
                for root, dirs, files in os.walk(firefox_dir):
                    for f in files:
                        if f.endswith('.admx'):
                            src = os.path.join(root, f)
                            dst = os.path.join(POLICY_DEFS, f)
                            shutil.copy2(src, dst)
                            print(f"    Installed: {f}")
                        elif f.endswith('.adml'):
                            src = os.path.join(root, f)
                            dst = os.path.join(POLICY_DEFS, "en-US", f)
                            shutil.copy2(src, dst)
                            print(f"    Installed: en-US/{f}")
        
        # Download Microsoft Edge ADMX
        print("\n[3/3] Microsoft Edge ADMX")
        edge_zip = os.path.join(temp_dir, "edge.zip")
        if download_file("https://edgeupdates.microsoft.com/api/products?view=enterprise", edge_zip):
            edge_dir = os.path.join(temp_dir, "edge")
            os.makedirs(edge_dir, exist_ok=True)
            if extract_zip(edge_zip, edge_dir):
                for root, dirs, files in os.walk(edge_dir):
                    for f in files:
                        if f.endswith('.admx'):
                            src = os.path.join(root, f)
                            dst = os.path.join(POLICY_DEFS, f)
                            shutil.copy2(src, dst)
                            print(f"    Installed: {f}")
                        elif f.endswith('.adml'):
                            src = os.path.join(root, f)
                            dst = os.path.join(POLICY_DEFS, "en-US", f)
                            shutil.copy2(src, dst)
                            print(f"    Installed: en-US/{f}")
    
    # Set permissions
    print("\nSetting permissions...")
    run_cmd(f'chown -R "BUILTIN\\administrators:BUILTIN\\administrators" "{POLICY_DEFS}"', check=False)
    run_cmd(f'chmod -R 775 "{POLICY_DEFS}"', check=False)
    
    # Count files
    admx_count = len([f for f in os.listdir(POLICY_DEFS) if f.endswith('.admx')])
    adml_count = len([f for f in os.listdir(os.path.join(POLICY_DEFS, "en-US")) if f.endswith('.adml')])
    
    print(f"\n{'=' * 60}")
    print(f"Installed: {admx_count} ADMX, {adml_count} ADML files")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
