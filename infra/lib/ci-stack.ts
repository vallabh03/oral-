import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { names } from "./app-stack.js";
import type { EnvConfig } from "./config.js";

/**
 * Lets GitHub Actions deploy this environment without stored AWS keys (OpenID Connect).
 * Only workflow jobs bound to the matching GitHub *environment* of the configured repository
 * can assume the role, so production approval rules in GitHub gate production deploys.
 * Deploy this stack once from an administrator session; GitHub deploys everything else.
 */
export class CiStack extends Stack {
  constructor(scope: Construct, id: string, cfg: EnvConfig, props: StackProps) {
    super(scope, id, props);
    const n = names(cfg.envName);
    const issuer = "token.actions.githubusercontent.com";
    // One provider per AWS account: create it with the first environment only.
    const providerArn = cfg.github.createOidcProvider
      ? new iam.OpenIdConnectProvider(this, "GithubOidc", { url: `https://${issuer}`, clientIds: ["sts.amazonaws.com"] }).openIdConnectProviderArn
      : `arn:aws:iam::${this.account}:oidc-provider/${issuer}`;

    const role = new iam.Role(this, "DeployRole", {
      roleName: n.deployRole,
      description: `GitHub Actions deploy role for ${cfg.github.repo} (${cfg.envName})`,
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: { [`${issuer}:aud`]: "sts.amazonaws.com", [`${issuer}:sub`]: `repo:${cfg.github.repo}:environment:${cfg.envName}` },
      }),
    });
    // `cdk deploy` works through the CDK bootstrap roles (asset publishing + CloudFormation).
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole", "sts:TagSession"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`],
      }),
    );
    // One-off admin tasks (e.g. first Super Admin) run the app's task definition.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask"],
        resources: [`arn:aws:ecs:${this.region}:${this.account}:task-definition/${n.family}:*`],
      }),
    );
    role.addToPolicy(new iam.PolicyStatement({ actions: ["ecs:DescribeTasks"], resources: ["*"] }));
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [n.taskRole, n.executionRole].map((r) => `arn:aws:iam::${this.account}:role/${r}`),
        conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/${n.stack}/*`],
      }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn, description: "Set as AWS_DEPLOY_ROLE_ARN in the GitHub environment" });
  }
}
