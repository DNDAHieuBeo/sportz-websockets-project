/**
 * ═══════════════════════════════════════════════════════════════
 * WEBSOCKET SERVER - REAL-TIME COMMUNICATION
 * ═══════════════════════════════════════════════════════════════
 * 
 * WHAT IS WEBSOCKET?
 * ──────────────────
 * WebSocket is a protocol that enables BIDIRECTIONAL, REAL-TIME communication
 * between client and server over a SINGLE, PERSISTENT connection.
 * 
 * HTTP vs WebSocket:
 * ──────────────────
 * HTTP (REST API):
 *   - Client requests → Server responds → Connection closes
 *   - Stateless (each request is independent)
 *   - Good for: CRUD operations, fetching data
 * 
 * WebSocket:
 *   - Client connects → Connection stays open → Both can send messages anytime
 *   - Stateful (connection persists)
 *   - Good for: Live updates, chat, notifications, real-time scores
 * 
 * THIS FILE IMPLEMENTS:
 * ────────────────────
 * 1. Subscription system: Clients subscribe to specific match updates
 * 2. Broadcasting: Server pushes updates to subscribed clients
 * 3. Connection management: Handling connect/disconnect/errors
 * 4. Heartbeat: Keeping connections alive and detecting dead connections
 */

import { WebSocketServer, WebSocket } from "ws";

// ═══════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════

/**
 * Store which clients are subscribed to which matches
 * 
 * Structure: Map<matchId, Set<WebSocket>>
 * Example:
 *   matchSubscribers = {
 *     1: Set([socket1, socket2]),  // 2 clients watching match 1
 *     5: Set([socket1])             // 1 client watching match 5
 *   }
 * 
 * WHY Map and Set?
 * - Map: Fast lookup by matchId (O(1))
 * - Set: Automatically prevents duplicate subscriptions
 */
const matchSubscribers = new Map();

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Subscribe a client to match updates
 * 
 * When a client sends: {"type":"subscribe", "matchId":1}
 * This function adds them to the subscribers list for match 1
 * 
 * @param {number} matchId - The match to subscribe to
 * @param {WebSocket} socket - The client's WebSocket connection
 */
function subscribe(matchId, socket) {
  // If this is the first subscriber for this match, create a new Set
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }
  // Add this socket to the Set of subscribers for this match
  matchSubscribers.get(matchId).add(socket);
}

/**
 * Unsubscribe a client from match updates
 * 
 * When a client sends: {"type":"unsubscribe", "matchId":1}
 * Or when a client disconnects
 * 
 * @param {number} matchId - The match to unsubscribe from
 * @param {WebSocket} socket - The client's WebSocket connection
 */
function unsubscribe(matchId, socket) {
  const subscribers = matchSubscribers.get(matchId);

  if (!subscribers) return; // No subscribers for this match

  // Remove this socket from the Set
  subscribers.delete(socket);

  // If no one is watching this match anymore, clean up the Map entry
  // This prevents memory leaks
  if (subscribers.size === 0) {
    matchSubscribers.delete(matchId);
  }
}

/**
 * Clean up all subscriptions when a client disconnects
 * 
 * When a WebSocket connection closes, we need to remove that client
 * from ALL matches they were subscribed to
 * 
 * @param {WebSocket} socket - The disconnected client
 */
function cleanupSubscription(socket) {
  // Loop through all matchIds this socket subscribed to
  for (const matchId of socket.subscriptions) {
    unsubscribe(matchId, socket);
  }
}

// ═══════════════════════════════════════════════════════════════
// BROADCASTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Broadcast a message to all clients subscribed to a specific match
 * 
 * Example: When commentary is added to match 1, only clients
 * subscribed to match 1 receive the update
 * 
 * @param {number} matchId - The match ID to broadcast to
 * @param {object} payload - The data to send (will be JSON stringified)
 */
function broadcastToMatch(matchId, payload) {
  // Get all clients subscribed to this match
  const subscribers = matchSubscribers.get(matchId);
  if (!subscribers || subscribers.size === 0) return; // No one watching

  // Convert payload to JSON string once (more efficient than doing it in loop)
  const message = JSON.stringify(payload);

  // Send to each subscribed client
  for (const client of subscribers) {
    // readyState checks if connection is still open
    // WebSocket.OPEN = 1 (connection is ready to send/receive)
    if (client.readyState == WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Send JSON data to a single client
 * 
 * Helper function to safely send JSON to one WebSocket
 * 
 * @param {WebSocket} socket - The client to send to
 * @param {object} payload - The data to send
 */
function sendJson(socket, payload) {
  // Only send if connection is still open
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

/**
 * Broadcast a message to ALL connected clients
 * 
 * Example: When a new match is created, notify everyone
 * 
 * @param {WebSocketServer} wss - The WebSocket server instance
 * @param {object} payload - The data to send
 */
function broadcastToAll(wss, payload) {
  // wss.clients is a Set of all connected WebSocket clients
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    client.send(JSON.stringify(payload));
  }
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════

/**
 * Handle incoming messages from WebSocket clients
 * 
 * CLIENT CAN SEND:
 * ────────────────
 * Subscribe:   {"type":"subscribe", "matchId":1}
 * Unsubscribe: {"type":"unsubscribe", "matchId":1}
 * 
 * SERVER RESPONDS WITH:
 * ─────────────────────
 * Success:     {"type":"subscribed", "matchId":1}
 * Error:       {"type":"error", "error":"Invalid JSON format."}
 * 
 * @param {WebSocket} socket - The client's connection
 * @param {Buffer} data - Raw message data from client
 */
function handleMessage(socket, data) {
  let message;
  
  // Parse incoming message (could be malformed)
  try {
    message = JSON.parse(data.toString());
  } catch (e) {
    // If JSON is invalid, send error and return early
    return sendJson(socket, {
      type: "error",
      error: "Invalid JSON format.",
    });
  }

  // Handle SUBSCRIBE message
  // Validate: message.type exists and matchId is a valid integer
  if (message?.type === 'subscribe' && Number.isInteger(message.matchId)) {
    // Add to server-side subscription tracking
    subscribe(message.matchId, socket);
    
    // Also track on socket object (for cleanup on disconnect)
    socket.subscriptions.add(message.matchId);
    
    // Send confirmation back to client
    sendJson(socket, {
      type: "subscribed",
      matchId: message.matchId,
    });
  }

  // Handle UNSUBSCRIBE message
  if (message?.type === 'unsubscribe' && Number.isInteger(message.matchId)) {
    // Remove from server-side subscription tracking
    unsubscribe(message.matchId, socket);
    
    // Remove from socket's local tracking
    socket.subscriptions.delete(message.matchId);
    
    // Send confirmation back to client
    sendJson(socket, {
      type: "unsubscribed",
      matchId: message.matchId,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN WEBSOCKET SERVER SETUP
// ═══════════════════════════════════════════════════════════════

/**
 * Attach WebSocket server to existing HTTP server
 * 
 * This function:
 * 1. Creates WebSocket server on the same port as Express
 * 2. Sets up connection handlers for new clients
 * 3. Implements heartbeat mechanism to detect dead connections
 * 4. Returns broadcast functions for use by REST API
 * 
 * @param {http.Server} server - The HTTP server instance
 * @returns {object} - Broadcast functions for match/commentary updates
 */
export function attachWebSocketServer(server) {
  // ─── Create WebSocket Server ──────────────────────────────────
  const wss = new WebSocketServer({
    server,                    // Attach to existing HTTP server
    path: "/ws",               // WebSocket endpoint: ws://localhost:8000/ws
    maxPayload: 1024 * 1024,   // Max message size: 1MB (prevents huge messages)
  });

  // ─── Handle New Connections ───────────────────────────────────
  // This runs every time a client connects to ws://localhost:8000/ws
  wss.on("connection", (socket) => {
    
    // Initialize socket properties
    socket.isAlive = true;                    // For heartbeat mechanism
    socket.subscriptions = new Set();         // Track which matches this client watches
    
    // ─── Heartbeat: Detect Dead Connections ───────────────────────
    // When server sends ping, client auto-responds with pong
    // If we receive pong, we know connection is alive
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    
    // ─── Send Welcome Message ─────────────────────────────────────
    // Let client know connection was successful
    sendJson(socket, {
      type: "welcome",
    });
    
    // ─── Set Up Event Handlers ────────────────────────────────────
    // When client sends message
    socket.on("message", (data) => handleMessage(socket, data));
    
    // When client disconnects (closes browser, loses internet, etc.)
    socket.on("close", () => cleanupSubscription(socket));
    
    // When error occurs (network issue, invalid data, etc.)
    socket.on("error", () => {
      socket.terminate(); // Force close connection
    });
  });

  // ─── Heartbeat Mechanism ──────────────────────────────────────
  /**
   * WHY HEARTBEAT?
   * ──────────────
   * Sometimes connections die without triggering 'close' event:
   * - Client loses internet
   * - Client computer sleeps
   * - Network timeout
   * 
   * Solution: Periodically ping all clients
   * - If they respond (pong), mark as alive
   * - If they don't respond, terminate connection
   */
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      // If client didn't respond to last ping, connection is dead
      if (ws.isAlive === false) {
        ws.terminate(); // Force close
        return;
      }
      
      // Mark as "not alive" (will be set to true if pong received)
      ws.isAlive = false;
      
      // Send ping (client auto-responds with pong if alive)
      ws.ping();
    });
  }, 30000); // Check every 30 seconds

  // Clean up interval when server closes
  wss.on("close", () => clearInterval(interval));

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API - BROADCAST FUNCTIONS
  // ═══════════════════════════════════════════════════════════════
  // These functions are returned and used by REST API routes
  
  /**
   * Broadcast when a new match is created
   * Sends to ALL connected clients
   * 
   * Called from: POST /matches after creating match
   */
  function broadcastMatchCreated(match) {
    broadcastToAll(wss, {
      type: "match_created",
      data: match,
    });
  }

  /**
   * Broadcast new commentary for a specific match
   * Sends ONLY to clients subscribed to this match
   * 
   * Called from: POST /matches/:id/commentary after creating commentary
   */
  function broadcastCommentary(matchId, comment) {
    broadcastToMatch(matchId, {
      type: "commentary",
      data: comment,
    });
  }

  // Return broadcast functions so REST API can use them
  return { broadcastMatchCreated, broadcastCommentary };
}
