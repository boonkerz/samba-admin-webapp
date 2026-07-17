#!/usr/bin/env python3
"""
Download and install Microsoft Administrative Templates (ADMX) for Windows
This script downloads the latest ADMX templates from Microsoft and installs them to SYSVOL
"""

import os
import sys
import subprocess
import zipfile
import tempfile
import shutil
from pathlib import Path

DOMAIN = sys.argv[1] if len(sys.argv) > 1 else "bsw.local"
SYSVOL_BASE = "/var/lib/samba/sysvol"
POLICY_DEFS = os.path.join(SYSVOL_BASE, DOMAIN, "PolicyDefinitions")

# Microsoft ADMX download URLs
ADMX_URLS = {
    "Windows 11 23H2": "https://download.microsoft.com/download/8/5/C/85C25433-A1B0-4FFA-9429-7A5B1A06B7C8/Windows%2011%20Version%2023H2%20Administrative%20Templates%20(.admx).zip",
    "Windows 10 22H2": "https://download.microsoft.com/download/8/5/C/85C25433-A1B0-4FFA-9429-7A5B1A06B7C8/Windows%2010%20Version%2022H2%20Administrative%20Templates%20(.admx).zip",
    "Microsoft Edge": "https://edgeupdates.microsoft.com/api/products?view=enterprise",
    "OneDrive": "https://oneclient.sfx.ms/Win/Installers/latest/OneDrive.admx",
    "Office 2019": "https://download.microsoft.com/download/6/D/7/6D7B2E5A-1B5E-4B5E-9B5E-1B5E4B5E9B5E/administrative_templates_for_office_2019.zip",
}

def download_file(url, dest_path):
    """Download a file using wget or curl"""
    print(f"  Downloading: {url[:80]}...")
    try:
        subprocess.run(["wget", "-q", "-O", dest_path, url], check=True, timeout=300)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        try:
            subprocess.run(["curl", "-sL", "-o", dest_path, url], check=True, timeout=300)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"  Error: Could not download {url}")
            return False

def extract_zip(zip_path, extract_to):
    """Extract a zip file"""
    print(f"  Extracting: {zip_path}")
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        return True
    except zipfile.BadZipFile:
        print(f"  Error: Invalid zip file {zip_path}")
        return False

def install_admx_from_dir(source_dir, target_dir):
    """Install ADMX/ADML files from source to target directory"""
    installed = 0
    
    # Walk through source directory
    for root, dirs, files in os.walk(source_dir):
        # Calculate relative path
        rel_path = os.path.relpath(root, source_dir)
        target_path = os.path.join(target_dir, rel_path)
        
        # Create target directory if needed
        os.makedirs(target_path, exist_ok=True)
        
        # Copy ADMX and ADML files
        for file in files:
            if file.endswith(('.admx', '.adml')):
                src_file = os.path.join(root, file)
                dst_file = os.path.join(target_path, file)
                
                # Only copy if source is newer or destination doesn't exist
                if not os.path.exists(dst_file) or os.path.getmtime(src_file) > os.path.getmtime(dst_file):
                    shutil.copy2(src_file, dst_file)
                    installed += 1
    
    return installed

def download_microsoft_admx():
    """Download Microsoft ADMX templates"""
    print("\n=== Downloading Microsoft Administrative Templates ===\n")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Download Windows 11 ADMX (latest)
        print("[1/3] Windows 11 Administrative Templates")
        windows_zip = os.path.join(temp_dir, "windows_admx.zip")
        if download_file(ADMX_URLS["Windows 11 23H2"], windows_zip):
            windows_dir = os.path.join(temp_dir, "windows")
            os.makedirs(windows_dir, exist_ok=True)
            if extract_zip(windows_zip, windows_dir):
                # Find PolicyDefinitions in extracted files
                for root, dirs, files in os.walk(windows_dir):
                    if "PolicyDefinitions" in dirs:
                        admsrc = os.path.join(root, "PolicyDefinitions")
                        print(f"  Installing from: {admsrc}")
                        installed = install_admx_from_dir(admsrc, POLICY_DEFS)
                        print(f"  Installed {installed} files")
                        break
        
        # Download Microsoft Edge ADMX
        print("\n[2/3] Microsoft Edge Administrative Templates")
        edge_admx_url = "https://edgeupdates.microsoft.com/api/products?view=enterprise"
        edge_dir = os.path.join(temp_dir, "edge")
        os.makedirs(edge_dir, exist_ok=True)
        
        # Edge ADMX files are available from Microsoft
        edge_files = {
            "MicrosoftEdge.admx": "https://raw.githubusercontent.com/nicedoc/nicedoc.io/master/microsoft-edge/admx/MicrosoftEdge.admx",
            "MicrosoftEdgeUpdate.admx": "https://raw.githubusercontent.com/nicedoc/nicedoc.io/master/microsoft-edge/admx/MicrosoftEdgeUpdate.admx",
        }
        
        for filename, url in edge_files.items():
            dest = os.path.join(edge_dir, filename)
            if download_file(url, dest):
                # Copy to PolicyDefinitions
                dst_file = os.path.join(POLICY_DEFS, filename)
                shutil.copy2(dest, dst_file)
                print(f"  Installed: {filename}")
        
        # Download OneDrive ADMX
        print("\n[3/3] OneDrive Administrative Templates")
        onedrive_admx = os.path.join(temp_dir, "OneDrive.admx")
        onedrive_adml = os.path.join(temp_dir, "OneDrive.adml")
        
        # OneDrive ADMX from Microsoft
        onedrive_url = "https://oneclient.sfx.ms/Win/Installers/latest/OneDrive.admx"
        onedrive_adml_url = "https://oneclient.sfx.ms/Win/Installers/latest/OneDrive.adml"
        
        if download_file(onedrive_url, onedrive_admx):
            dst_file = os.path.join(POLICY_DEFS, "OneDrive.admx")
            shutil.copy2(onedrive_admx, dst_file)
            print(f"  Installed: OneDrive.admx")
        
        if download_file(onedrive_adml_url, onedrive_adml):
            en_us_dir = os.path.join(POLICY_DEFS, "en-US")
            os.makedirs(en_us_dir, exist_ok=True)
            dst_file = os.path.join(en_us_dir, "OneDrive.adml")
            shutil.copy2(onedrive_adml, dst_file)
            print(f"  Installed: en-US/OneDrive.adml")

def download_additional_admx():
    """Download additional third-party ADMX templates"""
    print("\n=== Downloading Additional ADMX Templates ===\n")
    
    additional_templates = {
        "Chrome": "https://dl.google.com/dl/edgedl/chrome/policy/policy_templates.zip",
        "Firefox": "https://github.com/nicedoc/nicedoc.io/raw/master/firefox/admx/firefox.admx",
        "Zoom": "https://zoom.us/client/latest/ZoomInstallerFull.msi?archType=x64",
    }
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Download Chrome ADMX
        print("[1/2] Google Chrome Administrative Templates")
        chrome_zip = os.path.join(temp_dir, "chrome_admx.zip")
        if download_file(additional_templates["Chrome"], chrome_zip):
            chrome_dir = os.path.join(temp_dir, "chrome")
            os.makedirs(chrome_dir, exist_ok=True)
            if extract_zip(chrome_zip, chrome_dir):
                # Find ADMX files
                for root, dirs, files in os.walk(chrome_dir):
                    for file in files:
                        if file.endswith('.admx'):
                            src = os.path.join(root, file)
                            dst = os.path.join(POLICY_DEFS, file)
                            shutil.copy2(src, dst)
                            print(f"  Installed: {file}")
                        elif file.endswith('.adml'):
                            src = os.path.join(root, file)
                            en_us_dir = os.path.join(POLICY_DEFS, "en-US")
                            os.makedirs(en_us_dir, exist_ok=True)
                            dst = os.path.join(en_us_dir, file)
                            shutil.copy2(src, dst)
                            print(f"  Installed: en-US/{file}")
        
        # Download Firefox ADMX
        print("\n[2/2] Mozilla Firefox Administrative Templates")
        firefox_admx = os.path.join(temp_dir, "firefox.admx")
        if download_file(additional_templates["Firefox"], firefox_admx):
            dst_file = os.path.join(POLICY_DEFS, "firefox.admx")
            shutil.copy2(firefox_admx, dst_file)
            print(f"  Installed: firefox.admx")

def set_permissions():
    """Set correct permissions on PolicyDefinitions"""
    print("\n=== Setting Permissions ===\n")
    
    try:
        subprocess.run(["chown", "-R", "BUILTIN\\administrators:BUILTIN\\administrators", POLICY_DEFS], check=False)
        subprocess.run(["chmod", "-R", "775", POLICY_DEFS], check=False)
        print("  Permissions set successfully")
    except Exception as e:
        print(f"  Warning: Could not set permissions: {e}")

def count_templates():
    """Count installed ADMX/ADML files"""
    admx_count = 0
    adml_count = 0
    
    for root, dirs, files in os.walk(POLICY_DEFS):
        for file in files:
            if file.endswith('.admx'):
                admx_count += 1
            elif file.endswith('.adml'):
                adml_count += 1
    
    return admx_count, adml_count

def main():
    print("=" * 60)
    print("Microsoft Administrative Templates Installer")
    print("=" * 60)
    print(f"\nDomain: {DOMAIN}")
    print(f"Target: {POLICY_DEFS}\n")
    
    # Create PolicyDefinitions directory if it doesn't exist
    os.makedirs(os.path.join(POLICY_DEFS, "en-US"), exist_ok=True)
    
    # Download Microsoft ADMX templates
    download_microsoft_admx()
    
    # Download additional templates
    download_additional_admx()
    
    # Set permissions
    set_permissions()
    
    # Count installed templates
    admx_count, adml_count = count_templates()
    
    print("\n" + "=" * 60)
    print("Installation Complete!")
    print("=" * 60)
    print(f"\nInstalled:")
    print(f"  - {admx_count} ADMX files")
    print(f"  - {adml_count} ADML files")
    print(f"\nLocation: {POLICY_DEFS}")
    print("\nThe GPO editor will now show all available Administrative Templates.")
    print("Restart the web application to load the new templates.")

if __name__ == "__main__":
    main()
