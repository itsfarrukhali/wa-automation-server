import app from "./app.js";
import http from "http";
import connectToDB from "./src/config/db.js";
import ENV from "./src/lib/env.js";

const PORT = ENV.PORT;

const startServer = async () => {
  try {
    await connectToDB();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();
