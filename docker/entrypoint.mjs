// Container entrypoint. Builds DATABASE_URL from discrete variables (ECS injects the password
// from Secrets Manager; RDS-generated passwords may contain characters that need URL-encoding),
// then starts the web server or runs one operational command.
//   (no args)                     → Next.js server
//   migrate                       → apply migrations (+ provision the app DB role)
//   create-super-admin <email> …  → print a one-time setup link to the logs
//   create-staff <email> <role> … → same, for any role
const env = process.env;
if (!env.DATABASE_URL && env.DB_HOST) {
  // URL setters percent-encode the credentials. No sslmode in the URL: the app always connects
  // with TLS and full certificate verification (RDS CA bundle via NODE_EXTRA_CA_CERTS).
  const url = new URL("postgres://localhost");
  url.hostname = env.DB_HOST;
  url.port = env.DB_PORT || "5432";
  url.username = env.DB_USER ?? "";
  url.password = env.DB_PASSWORD ?? "";
  url.pathname = `/${env.DB_NAME || "taoc"}`;
  env.DATABASE_URL = url.href;
}
delete env.DB_PASSWORD;

const [cmd, ...args] = process.argv.slice(2);
const ops = new Set(["migrate", "create-super-admin", "create-staff"]);
if (!cmd) {
  await import(new URL("./server.js", import.meta.url).href);
} else if (ops.has(cmd)) {
  process.argv = [process.argv[0], cmd, ...args];
  await import(new URL(`./dist/ops/${cmd}.mjs`, import.meta.url).href);
} else {
  console.error(`Unknown command: ${cmd}. Use one of: ${[...ops].join(", ")}`);
  process.exit(64);
}
