import app from "./app.js";
import http from "http";
import connectToDB from "./src/config/db.js";
import { env } from "./src/lib/env.js";
import {
  startSchedulerWorker,
  stopSchedulerWorker,
} from "./src/workers/scheduler.worker.js";

const PORT = env.PORT;

const startServer = async () => {
  try {
    await connectToDB();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startSchedulerWorker();
    });

    const shutdown = (signal) => {
      console.log(`Received ${signal}. Shutting down...`);
      stopSchedulerWorker();
      server.close(() => {
        process.exit(0);
      });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();
