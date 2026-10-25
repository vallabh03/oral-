// CDK entry point. Pick the environment with `-c env=staging|production` (default: staging).
//   npx cdk deploy Taoc-staging-Ci   (once, from an administrator session)
//   npx cdk deploy Taoc-staging      (normally from GitHub Actions)
import { App } from "aws-cdk-lib";
import { AppStack, names } from "../lib/app-stack.js";
import { CiStack } from "../lib/ci-stack.js";
import { loadConfig } from "../lib/config.js";

const app = new App();
const cfg = loadConfig(app.node.tryGetContext("env") ?? "staging");
const env = { account: cfg.account, region: cfg.region };
const n = names(cfg.envName);

new CiStack(app, `${n.stack}-Ci`, cfg, { env, description: `TAOC ${cfg.envName}: GitHub Actions deploy role` });
new AppStack(app, n.stack, cfg, { env, description: `TAOC DRIVE SAFE platform (${cfg.envName})`, terminationProtection: cfg.appEnv === "production" });
