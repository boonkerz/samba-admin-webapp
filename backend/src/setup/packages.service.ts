import { runCapture } from "../exec/safeExec.js";
import { startJob } from "../jobs/jobRunner.js";
import { detectDistro, requiredPackages } from "./distro.service.js";

/**
 * krb5-config's postinst normally prompts interactively for the default
 * Kerberos realm. The real realm is only chosen in the wizard's next step
 * (provisioning), so we preseed a placeholder here purely to keep the install
 * non-interactive — `samba-tool domain provision` regenerates /etc/krb5.conf
 * from scratch afterwards, so this placeholder is fully overwritten later.
 */
async function preseedKrb5(): Promise<void> {
  const preseed = [
    "krb5-config krb5-config/default_realm string EXAMPLE.COM",
    "krb5-config krb5-config/add_servers boolean false",
    "krb5-config krb5-config/kerberos_servers string",
    "krb5-config krb5-config/admin_server string",
  ].join("\n");
  await runCapture("debconf-set-selections", [], { input: preseed + "\n" });
}

export async function startPackageInstallJob(dnsBackend: "SAMBA_INTERNAL" | "BIND9_DLZ"): Promise<string> {
  // Affects this process and all children (apt-get, dpkg maintainer scripts):
  // required so package installs never block on a debconf prompt.
  process.env.DEBIAN_FRONTEND = "noninteractive";

  const distro = detectDistro();
  const packages = requiredPackages(distro, dnsBackend);

  await preseedKrb5();
  await runCapture("apt-get", ["update"]);

  const jobId = startJob("package-install", "apt-get", [
    "-y",
    "-o",
    "Dpkg::Options::=--force-confold",
    "--no-install-recommends",
    "install",
    ...packages,
  ], {});

  return jobId;
}
