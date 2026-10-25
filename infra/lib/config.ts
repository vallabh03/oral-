import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface EnvConfig {
  envName: string;
  appEnv: "staging" | "production";
  account: string;
  region: string;
  availabilityZones: string[];
  siteUrl: string;
  /** Either an existing ACM certificate ARN, or a domain to issue one for (DNS validation). */
  certificate: { arn: string; domainName: string; route53ZoneName: string };
  alarmEmail: string;
  github: { repo: string; createOidcProvider: boolean };
  app: { cpu: number; memoryMiB: number; desiredCount: number; maxCount: number };
  db: {
    instanceClass: string;
    multiAz: boolean;
    allocatedStorageGb: number;
    maxAllocatedStorageGb: number;
    backupRetentionDays: number;
    deletionProtection: boolean;
  };
  waf: { requestsPer5MinPerIp: number };
  features: { intakeEnabled: boolean; indexingEnabled: boolean; clinicalImagesEnabled: boolean; oidcEnabled: boolean };
  participantIdPrefix: string;
  email: { driver: "console" | "ses"; from: string; contactTo: string; sesRegion: string };
}

export const infraDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadConfig(envName: string): EnvConfig {
  if (!/^[a-z][a-z0-9-]{1,20}$/.test(envName)) throw new Error(`Invalid environment name: ${envName}`);
  const file = path.join(infraDir, "config", `${envName}.json`);
  const c = JSON.parse(fs.readFileSync(file, "utf8")) as EnvConfig;
  const problems: string[] = [];
  if (!/^\d{12}$/.test(c.account)) problems.push("account must be a 12-digit AWS account id");
  if (!c.siteUrl.startsWith("https://")) problems.push("siteUrl must be https://");
  if (!c.certificate.arn && !c.certificate.domainName) problems.push("certificate.arn or certificate.domainName is required");
  if (!/^[\w.-]+\/[\w.-]+$/.test(c.github.repo)) problems.push("github.repo must be OWNER/REPO");
  if (c.availabilityZones.length < 2) problems.push("at least two availabilityZones are required");
  if (problems.length) throw new Error(`config/${envName}.json: ${problems.join("; ")}`);
  return c;
}
