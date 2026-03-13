/**
 * ═══════════════════════════════════════════════════════════════
 * SPORTZ API - MAIN ENTRY POINT
 * ═══════════════════════════════════════════════════════════════
 * 
 * This is the main server file that sets up:
 * 1. Express REST API for HTTP requests (GET, POST, etc.)
 * 2. WebSocket server for real-time bidirectional communication
 * 3. Routes for matches and commentary
 * 
 * ARCHITECTURE OVERVIEW:
 * ─────────────────────
 * HTTP Server (Express)
 *   ├─ REST API endpoints for CRUD operations
 *   └─ WebSocket server attached to same port
 * 
 * WHY BOTH REST + WEBSOCKET?
 * ──────────────────────────
 * - REST API: Used for creating/reading data (GET /matches, POST /matches)
 * - WebSocket: Used for real-time updates (live match scores, commentary)
 * 
 * This pattern is common in sports apps, chat apps, stock trading, etc.
 */

import express from "express";
import http from "http"; // We need Node's HTTP module to attach WebSocket to the same port
import { matchRouter } from "./routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";
import { commentaryRouter } from "./routes/commentary.js";

// ─── Configuration ──────────────────────────────────────────────
// Get port from environment variable or default to 8000
const PORT = Number(process.env.PORT || 8000);
// 0.0.0.0 means "listen on all network interfaces" (allows external connections)
const HOST = process.env.HOST || "0.0.0.0";

// ─── Server Setup ───────────────────────────────────────────────
// Create Express app (handles routing, middleware, etc.)
const app = express();

// Create HTTP server wrapping Express
// WHY? Because WebSocket needs to attach to the raw HTTP server, not Express
const server = http.createServer(app);

// ─── Middleware ─────────────────────────────────────────────────
// Parse incoming JSON request bodies automatically
// Without this, req.body would be undefined
app.use(express.json());

// ─── Routes ─────────────────────────────────────────────────────
// Root endpoint - just a welcome message
app.get("/", (req, res) => {
  res.send("Welcome to the Sportz API! 🏆");
});

// Mount routers:
// - /matches -> List matches, create matches
// - /matches/:id/commentary -> Get commentary for a specific match
app.use("/matches", matchRouter);
app.use("/matches/:id/commentary", commentaryRouter);

// ─── WebSocket Integration ──────────────────────────────────────
// Attach WebSocket server to the same HTTP server
// This returns broadcast functions we can call from REST routes
const { broadcastMatchCreated, broadcastCommentary } = attachWebSocketServer(server);

// Store broadcast functions in app.locals so routes can access them
// This allows REST endpoints to push updates to WebSocket clients
// Example: When POST /matches creates a match, it broadcasts to all connected clients
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

// ─── Start Server ───────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server is running at ${baseUrl}`);
  console.log(`WebSocket endpoint available at ws://localhost:${PORT}/ws`);
});
