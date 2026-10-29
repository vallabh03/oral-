import path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";
import { infraDir, type EnvConfig } from "./config.js";

export const APP_DB_USER = "taoc_app";
export const names = (env: string) => ({
  stack: `Taoc-${env}`,
  family: `taoc-${env}-app`,
  taskRole: `taoc-${env}-task-role`,
  executionRole: `taoc-${env}-exec-role`,
  deployRole: `taoc-${env}-github-deploy`,
});

/**
 * One environment of the platform:
 * ALB (HTTPS, WAF) → ECS Fargate (Next.js container; a migration init-container runs first)
 * → RDS PostgreSQL in isolated subnets, private KMS-encrypted S3 buckets, Secrets Manager.
 * No NAT gateway: tasks sit in public subnets with a public IP for egress, but their security
 * group only admits traffic from the load balancer. The database has no route to the internet.
 */
export class AppStack extends Stack {
  private readonly azs: string[];

  // Fixed AZs from config: synth needs no AWS lookup and the VPC never shifts between AZs.
  override get availabilityZones(): string[] {
    return this.azs;
  }

  constructor(scope: Construct, id: string, cfg: EnvConfig, props: StackProps) {
    super(scope, id, props);
    this.azs = cfg.availabilityZones;
    const env = cfg.envName;
    const n = names(env);
    const prod = cfg.appEnv === "production";
    Tags.of(this).add("project", "taoc-drive-safe");
    Tags.of(this).add("environment", env);

    // ---------- Network ----------
    const vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.40.0.0/16"),
      availabilityZones: cfg.availabilityZones,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });

    // ---------- Encryption keys ----------
    const key = (id: string, alias: string) =>
      new kms.Key(this, id, { alias: `alias/taoc-${env}-${alias}`, enableKeyRotation: true, removalPolicy: RemovalPolicy.RETAIN });
    const dbKey = key("DbKey", "db");
    const photosKey = key("PhotosKey", "photos");
    const clinicalKey = key("ClinicalKey", "clinical-images");

    // ---------- Secrets (generated in AWS, never in git or CI) ----------
    const generated = (id: string, name: string, length: number, description: string) =>
      new secretsmanager.Secret(this, id, {
        secretName: `taoc/${env}/${name}`,
        description,
        generateSecretString: { passwordLength: length, excludePunctuation: true },
        removalPolicy: RemovalPolicy.RETAIN,
      });
    const auditSecret = generated("AuditHmacSecret", "audit-hmac-secret", 64, "AUDIT_HMAC_SECRET: signs the tamper-evident audit chain");
    const dataKeySecret = generated("DataEncryptionKey", "data-encryption-key", 64, "DATA_ENCRYPTION_KEY: encrypts MFA secrets and other fields. Losing it makes that data unreadable");
    const appDbSecret = generated("AppDbPassword", "db-app-password", 40, `Password for the ${APP_DB_USER} (DML-only) database role`);

    // ---------- Database ----------
    const dbParams = new rds.ParameterGroup(this, "DbParams", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      parameters: { "rds.force_ssl": "1", log_min_duration_statement: "2000", log_connections: "1" },
    });
    const database = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      instanceType: new ec2.InstanceType(cfg.db.instanceClass),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      publiclyAccessible: false,
      multiAz: cfg.db.multiAz,
      databaseName: "taoc",
      credentials: rds.Credentials.fromGeneratedSecret("taoc_owner", { secretName: `taoc/${env}/db-owner`, excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\" }),
      parameterGroup: dbParams,
      storageType: rds.StorageType.GP3,
      allocatedStorage: cfg.db.allocatedStorageGb,
      maxAllocatedStorage: cfg.db.maxAllocatedStorageGb,
      storageEncrypted: true,
      storageEncryptionKey: dbKey,
      caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
      backupRetention: Duration.days(cfg.db.backupRetentionDays),
      preferredBackupWindow: "20:00-21:00", // 01:30–02:30 IST
      preferredMaintenanceWindow: "sun:21:30-sun:22:30",
      deleteAutomatedBackups: false,
      deletionProtection: cfg.db.deletionProtection,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
      copyTagsToSnapshot: true,
    });

    // ---------- Private object storage ----------
    const bucket = (id: string, encryptionKey: kms.Key) =>
      new s3.Bucket(this, id, {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey,
        bucketKeyEnabled: true,
        enforceSSL: true,
        minimumTLSVersion: 1.2,
        versioned: true,
        removalPolicy: RemovalPolicy.RETAIN,
        // Retention of photos is pending the privacy owner (ADR-16); only housekeeping here:
        // unfinished uploads are dropped, a deleted photo stays recoverable for 30 days, then is gone.
        lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(7), noncurrentVersionExpiration: Duration.days(30), expiredObjectDeleteMarker: true }],
      });
    const photos = bucket("PhotosBucket", photosKey);
    const clinical = bucket("ClinicalImagesBucket", clinicalKey);
    // Virtual screening: patients' browsers PUT straight to quarantine/ with presigned links (site origin only);
    // the app deletes checked uploads within seconds, the lifecycle rule catches abandoned ones.
    const siteHost = new URL(cfg.siteUrl).host;
    clinical.addCorsRule({
      allowedOrigins: [`https://${siteHost}`, ...(siteHost.startsWith("www.") ? [] : [`https://www.${siteHost}`])],
      allowedMethods: [s3.HttpMethods.PUT],
      allowedHeaders: ["*"],
      exposedHeaders: ["ETag"],
      maxAge: 600,
    });
    clinical.addLifecycleRule({ prefix: "quarantine/", expiration: Duration.days(1), noncurrentVersionExpiration: Duration.days(1) });

    const albLogs = new s3.Bucket(this, "AlbLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED, // ALB log delivery does not support SSE-KMS
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: Duration.days(prod ? 365 : 90) }],
    });

    // ---------- Container ----------
    const cluster = new ecs.Cluster(this, "Cluster", { vpc, containerInsightsV2: ecs.ContainerInsights.ENABLED });
    const taskRole = new iam.Role(this, "TaskRole", { roleName: n.taskRole, assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com") });
    const executionRole = new iam.Role(this, "ExecutionRole", {
      roleName: n.executionRole,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy")],
    });
    photos.grantReadWrite(taskRole);
    photos.grantDelete(taskRole);
    clinical.grantReadWrite(taskRole);
    clinical.grantDelete(taskRole);
    if (cfg.email.driver === "ses") {
      taskRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ["ses:SendEmail"],
          resources: ["*"],
          conditions: { StringEquals: { "ses:FromAddress": cfg.email.from } },
        }),
      );
    }

    const taskDef = new ecs.FargateTaskDefinition(this, "Task", {
      family: n.family,
      cpu: cfg.app.cpu,
      memoryLimitMiB: cfg.app.memoryMiB,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
      taskRole,
      executionRole,
    });
    const image = ecs.ContainerImage.fromAsset(path.resolve(infraDir, ".."), {
      platform: Platform.LINUX_AMD64,
      buildArgs: { NEXT_PUBLIC_SITE_URL: cfg.siteUrl, APP_ENV: cfg.appEnv },
    });
    const logGroup = new logs.LogGroup(this, "AppLogs", {
      logGroupName: `/taoc/${env}/app`,
      retention: prod ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const bool = (b: boolean) => (b ? "true" : "false");
    const commonEnv: Record<string, string> = {
      APP_ENV: cfg.appEnv,
      NEXT_PUBLIC_SITE_URL: cfg.siteUrl,
      INDEXING_ENABLED: bool(cfg.features.indexingEnabled),
      TRUSTED_PROXY_HOPS: "1", // the ALB is the only proxy
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_PORT: database.dbInstanceEndpointPort,
      DB_NAME: "taoc",
      DB_POOL_MAX: "10",
      AWS_REGION: this.region,
      STORAGE_DRIVER: "s3",
      S3_BUCKET: photos.bucketName,
      S3_KMS_KEY_ID: photosKey.keyArn,
      CLINICAL_IMAGES_ENABLED: bool(cfg.features.clinicalImagesEnabled),
      CLINICAL_S3_BUCKET: clinical.bucketName,
      CLINICAL_S3_KMS_KEY_ID: clinicalKey.keyArn,
      AUTH_PASSWORD_ENABLED: "true",
      OIDC_ENABLED: bool(cfg.features.oidcEnabled),
      INTAKE_ENABLED: bool(cfg.features.intakeEnabled),
      PARTICIPANT_ID_PREFIX: cfg.participantIdPrefix,
      EMAIL_DRIVER: cfg.email.driver,
      EMAIL_FROM: cfg.email.from,
      CONTACT_TO_EMAIL: cfg.email.contactTo,
      ...(cfg.email.sesRegion ? { SES_REGION: cfg.email.sesRegion } : {}),
      WHATSAPP_ENABLED: "false",
    };
    const appSecrets = {
      AUDIT_HMAC_SECRET: ecs.Secret.fromSecretsManager(auditSecret),
      DATA_ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(dataKeySecret),
    };
    const ownerSecret = database.secret!;

    // Init container: applies migrations as the schema owner and keeps the app role in sync.
    // Only this container ever sees the owner credentials. Migrations are serialised by an
    // advisory lock, so several tasks starting together is safe.
    const migrate = taskDef.addContainer("migrate", {
      image,
      command: ["migrate"],
      essential: false,
      environment: { ...commonEnv, APP_DB_USER },
      secrets: {
        ...appSecrets,
        DB_USER: ecs.Secret.fromSecretsManager(ownerSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(ownerSecret, "password"),
        APP_DB_PASSWORD: ecs.Secret.fromSecretsManager(appDbSecret),
      },
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "migrate" }),
    });
    const app = taskDef.addContainer("app", {
      image,
      essential: true,
      environment: { ...commonEnv, DB_USER: APP_DB_USER },
      secrets: { ...appSecrets, DB_PASSWORD: ecs.Secret.fromSecretsManager(appDbSecret) },
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "app" }),
      stopTimeout: Duration.seconds(30),
    });
    app.addContainerDependencies({ container: migrate, condition: ecs.ContainerDependencyCondition.SUCCESS });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: cfg.app.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(180),
      enableExecuteCommand: false,
    });
    database.connections.allowDefaultPortFrom(service, "App and migration containers");
    service
      .autoScaleTaskCount({ minCapacity: cfg.app.desiredCount, maxCapacity: cfg.app.maxCount })
      .scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 65, scaleOutCooldown: Duration.seconds(60), scaleInCooldown: Duration.minutes(5) });

    // ---------- HTTPS entry point ----------
    const zone = cfg.certificate.route53ZoneName ? route53.HostedZone.fromLookup(this, "Zone", { domainName: cfg.certificate.route53ZoneName }) : undefined;
    const certificate = cfg.certificate.arn
      ? acm.Certificate.fromCertificateArn(this, "Cert", cfg.certificate.arn)
      : new acm.Certificate(this, "Cert", {
          domainName: cfg.certificate.domainName,
          // Without Route 53, the stack waits until the CNAME shown in the ACM console is added at your DNS provider.
          validation: zone ? acm.CertificateValidation.fromDns(zone) : acm.CertificateValidation.fromDns(),
        });

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", { vpc, internetFacing: true, dropInvalidHeaderFields: true, idleTimeout: Duration.seconds(60) });
    alb.logAccessLogs(albLogs, "alb");
    const https = alb.addListener("Https", { port: 443, certificates: [certificate], sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS, open: true });
    const targetGroup = https.addTargets("App", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: { path: "/api/health", healthyHttpCodes: "200", interval: Duration.seconds(30), healthyThresholdCount: 2, unhealthyThresholdCount: 3 },
    });
    alb.addRedirect({ sourcePort: 80, targetPort: 443 });
    if (zone) {
      new route53.ARecord(this, "AliasRecord", {
        zone,
        recordName: cfg.certificate.domainName,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
      });
    }

    // ---------- Web application firewall ----------
    const visibility = (metricName: string) => ({ cloudWatchMetricsEnabled: true, sampledRequestsEnabled: true, metricName });
    // Photo uploads are binary bodies that trip generic body inspection rules; the app validates them itself.
    const notUpload: wafv2.CfnWebACL.StatementProperty = {
      notStatement: {
        statement: {
          orStatement: {
            statements: ["/photo", "/lesion-images"].map((p) => ({
              byteMatchStatement: { fieldToMatch: { uriPath: {} }, positionalConstraint: "CONTAINS", searchString: p, textTransformations: [{ priority: 0, type: "NONE" }] },
            })),
          },
        },
      },
    };
    const managed = (name: string, priority: number, extra: Partial<wafv2.CfnWebACL.ManagedRuleGroupStatementProperty> = {}): wafv2.CfnWebACL.RuleProperty => ({
      name,
      priority,
      overrideAction: { none: {} },
      statement: { managedRuleGroupStatement: { vendorName: "AWS", name, ...extra } },
      visibilityConfig: visibility(name),
    });
    const acl = new wafv2.CfnWebACL(this, "Waf", {
      scope: "REGIONAL",
      defaultAction: { allow: {} },
      visibilityConfig: visibility(`taoc-${env}`),
      rules: [
        {
          name: "RatePerIp",
          priority: 0,
          action: { block: {} },
          // Camps share one mobile/Wi-Fi IP between many participants, so this is deliberately generous.
          statement: { rateBasedStatement: { limit: cfg.waf.requestsPer5MinPerIp, aggregateKeyType: "IP" } },
          visibilityConfig: visibility("RatePerIp"),
        },
        managed("AWSManagedRulesAmazonIpReputationList", 1),
        managed("AWSManagedRulesKnownBadInputsRuleSet", 2),
        managed("AWSManagedRulesCommonRuleSet", 3, {
          scopeDownStatement: notUpload,
          // JSON form posts can exceed the rule's 8 KB body limit; size is enforced by the app.
          ruleActionOverrides: [{ name: "SizeRestrictions_BODY", actionToUse: { count: {} } }],
        }),
        managed("AWSManagedRulesSQLiRuleSet", 4, { scopeDownStatement: notUpload }),
      ],
    });
    new wafv2.CfnWebACLAssociation(this, "WafAssociation", { resourceArn: alb.loadBalancerArn, webAclArn: acl.attrArn });

    // ---------- Alarms ----------
    const topic = new sns.Topic(this, "Alarms", { displayName: `TAOC ${env} alarms` });
    if (cfg.alarmEmail) topic.addSubscription(new subs.EmailSubscription(cfg.alarmEmail));
    const alarm = (id: string, metric: cloudwatch.IMetric, threshold: number, description: string, op = cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD) =>
      new cloudwatch.Alarm(this, id, {
        metric,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: op,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: description,
      }).addAlarmAction(new cwActions.SnsAction(topic));
    alarm("Http5xx", alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: Duration.minutes(5), statistic: "Sum" }), 10, "Server errors from the app");
    alarm("UnhealthyTasks", targetGroup.metrics.unhealthyHostCount({ period: Duration.minutes(5), statistic: "Maximum" }), 1, "A task is failing /api/health");
    alarm("WafBlocks", new cloudwatch.Metric({ namespace: "AWS/WAFV2", metricName: "BlockedRequests", dimensionsMap: { WebACL: `taoc-${env}`, Region: this.region, Rule: "ALL" }, period: Duration.minutes(5), statistic: "Sum" }), 500, "Unusual number of blocked requests");
    alarm("DbCpu", database.metricCPUUtilization({ period: Duration.minutes(10) }), 80, "Database CPU high");
    alarm("DbStorage", database.metricFreeStorageSpace({ period: Duration.minutes(10) }), 2 * 1024 ** 3, "Database storage below 2 GB", cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD);
    alarm("DbConnections", database.metricDatabaseConnections({ period: Duration.minutes(5) }), cfg.app.maxCount * 10 + 10, "Database connections near the pool ceiling");

    // ---------- Outputs ----------
    new CfnOutput(this, "SiteUrl", { value: cfg.siteUrl });
    new CfnOutput(this, "LoadBalancerDns", { value: alb.loadBalancerDnsName, description: `Point ${cfg.certificate.domainName || "your domain"} here (CNAME) if DNS is not in Route 53` });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: service.serviceName });
    new CfnOutput(this, "TaskFamily", { value: n.family });
    new CfnOutput(this, "TaskSecurityGroup", { value: service.connections.securityGroups[0]!.securityGroupId });
    new CfnOutput(this, "TaskSubnets", { value: vpc.publicSubnets.map((s) => s.subnetId).join(",") });
    new CfnOutput(this, "LogGroup", { value: logGroup.logGroupName });
    new CfnOutput(this, "DbOwnerSecret", { value: ownerSecret.secretName });
  }
}
