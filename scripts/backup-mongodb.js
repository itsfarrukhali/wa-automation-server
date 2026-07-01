import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const backupRoot = path.resolve(process.cwd(), "backups");
fs.mkdirSync(backupRoot, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(backupRoot, `mongo-${timestamp}`);

const args = ["--uri", mongoUri, "--out", outputDir];

console.log(`[backup] Starting MongoDB backup to ${outputDir}`);

const child = spawn("mongodump", args, {
  stdio: ["ignore", "inherit", "inherit"],
  shell: false,
});

child.on("error", (error) => {
  console.error(`[backup] Failed to start mongodump: ${error.message}`);
  console.error("[backup] Install MongoDB Database Tools and ensure mongodump is in PATH.");
  process.exit(1);
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`[backup] mongodump exited with code ${code}`);
    process.exit(code);
  }
  console.log(`[backup] Completed: ${outputDir}`);
});
