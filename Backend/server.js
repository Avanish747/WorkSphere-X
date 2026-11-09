require('dotenv').config();
const http = require('node:http');
const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  await connectDB();
  const server = http.createServer(app);

  server.listen(PORT, () => {
    console.log(`WorkSphere X backend running on http://localhost:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Closing HTTP and MongoDB connections.`);
    server.close(async (error) => {
      if (error) {
        console.error('HTTP server shutdown failed:', error);
        process.exitCode = 1;
      }
      await require('mongoose').disconnect();
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Application startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
