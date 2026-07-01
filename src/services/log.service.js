import fs from "fs/promises";
import path from "path";
import { LOG_DIR } from "../lib/logger.js";
import { AppError } from "../utils/helpers/errorHandler.utils.js";

const ALLOWED_LOG_FILES = new Set(["app.log", "error.log"]);

export const listLogFiles = async () => {
  const files = await fs.readdir(LOG_DIR).catch(() => []);
  const logs = [];

  for (const file of files.filter((item) => ALLOWED_LOG_FILES.has(item))) {
    const stat = await fs.stat(path.join(LOG_DIR, file));
    logs.push({
      file,
      size: stat.size,
      updatedAt: stat.mtime,
    });
  }

  return { logs };
};

export const tailLogFile = async ({ file = "app.log", lines = 200 } = {}) => {
  if (!ALLOWED_LOG_FILES.has(file)) {
    throw new AppError("Invalid log file.", 422);
  }

  const safeLines = Math.min(Math.max(Number(lines), 1), 1000);
  const fullPath = path.join(LOG_DIR, file);
  const content = await fs.readFile(fullPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });

  const entries = content
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-safeLines)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { message: line };
      }
    });

  return {
    file,
    lines: entries.length,
    entries,
  };
};
