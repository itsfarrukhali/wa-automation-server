import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const mongoUri = process.env.MONGODB_URI;
const backupPath = process.argv[2];
const drop = process.argv.includes("--drop");

if (!mongoUri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

if (!backupPath) {
  console.error("Usage: node scripts/restore-mongodb.js <backup-path> [--drop]");
  process.exit(1);
}

const resolvedBackupPath = path.resolve(process.cwd(), backupPath);
if (!fs.existsSync(resolvedBackupPath)) {
  console.error(`Backup path does not exist: ${resolvedBackupPath}`);
  process.exit(1);
}

const args = ["--uri", mongoUri];
if (drop) args.push("--drop");
args.push(resolvedBackupPath);

console.log(`[restore] Restoring MongoDB from ${resolvedBackupPath}`);
if (drop) console.warn("[restore] --drop enabled: existing collections will be dropped.");

const child = spawn("mongorestore", args, {
  stdio: ["ignore", "inherit", "inherit"],
  shell: false,
});

child.on("error", (error) => {
  console.error(`[restore] Failed to start mongorestore: ${error.message}`);
  console.error("[restore] Install MongoDB Database Tools and ensure mongorestore is in PATH.");
  process.exit(1);
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`[restore] mongorestore exited with code ${code}`);
    process.exit(code);
  }
  console.log("[restore] Completed.");
});
