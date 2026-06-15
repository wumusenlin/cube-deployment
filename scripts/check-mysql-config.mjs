import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const configPath = ".env.mysql";
const requiredKeys = [
  "CUBEJS_DB_TYPE",
  "CUBEJS_DB_HOST",
  "CUBEJS_DB_PORT",
  "CUBEJS_DB_NAME",
  "CUBEJS_DB_USER",
  "CUBEJS_DB_PASS",
];
const placeholderValues = new Set([
  "mysql.example.com",
  "your_database",
  "your_username",
  "your_password",
]);

let config;

try {
  config = parseEnv(readFileSync(configPath, "utf8"));
} catch (error) {
  console.error(`[MySQL] Cannot read ${configPath}: ${error.message}`);
  process.exit(1);
}

const invalidKeys = requiredKeys.filter((key) => {
  const value = config[key]?.trim();
  return !value || placeholderValues.has(value);
});

if (config.CUBEJS_DB_TYPE !== "mysql") {
  invalidKeys.push("CUBEJS_DB_TYPE");
}

const port = Number(config.CUBEJS_DB_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  invalidKeys.push("CUBEJS_DB_PORT");
}

if (!["true", "false"].includes(config.CUBEJS_DB_SSL ?? "false")) {
  invalidKeys.push("CUBEJS_DB_SSL");
}

const uniqueInvalidKeys = [...new Set(invalidKeys)];

if (uniqueInvalidKeys.length > 0) {
  console.error(
    `[MySQL] Complete these settings in ${configPath}: ${uniqueInvalidKeys.join(", ")}`
  );
  process.exit(1);
}

console.log(
  `[MySQL] Config OK: ${config.CUBEJS_DB_USER}@${config.CUBEJS_DB_HOST}:${config.CUBEJS_DB_PORT}/${config.CUBEJS_DB_NAME}, SSL=${config.CUBEJS_DB_SSL ?? "false"}`
);
