import { env } from "../lib/env.js";
import { runScheduledMessagesAcrossBusinesses } from "../services/scheduler.service.js";

let intervalHandle = null;
let isRunning = false;
let lastRun = null;
let lastResult = null;
let lastError = null;

const workerEnabled = () =>
  env.ENABLE_SCHEDULER_WORKER === true ||
  env.ENABLE_SCHEDULER_WORKER === "true";

export const getSchedulerWorkerStatus = () => ({
  enabled: workerEnabled(),
  running: Boolean(intervalHandle),
  isRunning,
  intervalSeconds: env.SCHEDULER_INTERVAL_SECONDS,
  batchLimit: env.SCHEDULER_BATCH_LIMIT,
  lastRun,
  lastResult,
  lastError,
});

export const runSchedulerWorkerOnce = async () => {
  if (isRunning) {
    return {
      skipped: true,
      reason: "worker_already_running",
    };
  }

  isRunning = true;
  lastRun = new Date();
  lastError = null;

  try {
    lastResult = await runScheduledMessagesAcrossBusinesses({
      type: "all",
      limit: env.SCHEDULER_BATCH_LIMIT,
      lockSeconds: env.SCHEDULER_LOCK_SECONDS,
      owner: `scheduler-worker-${process.pid}`,
    });
    return lastResult;
  } catch (error) {
    lastError = {
      message: error.message,
      at: new Date(),
    };
    console.error("[scheduler-worker] run failed:", error.message);
    return {
      skipped: false,
      error: error.message,
    };
  } finally {
    isRunning = false;
  }
};

export const startSchedulerWorker = () => {
  if (!workerEnabled()) {
    console.log("[scheduler-worker] disabled");
    return null;
  }

  if (intervalHandle) return intervalHandle;

  const intervalMs = Math.max(Number(env.SCHEDULER_INTERVAL_SECONDS), 10) * 1000;
  console.log(`[scheduler-worker] enabled; running every ${intervalMs / 1000}s`);

  setTimeout(() => {
    runSchedulerWorkerOnce();
  }, 1000);

  intervalHandle = setInterval(() => {
    runSchedulerWorkerOnce();
  }, intervalMs);

  return intervalHandle;
};

export const stopSchedulerWorker = () => {
  if (!intervalHandle) return;

  clearInterval(intervalHandle);
  intervalHandle = null;
  console.log("[scheduler-worker] stopped");
};
