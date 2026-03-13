/**
 * ═══════════════════════════════════════════════════════════════
 * MATCHES ROUTER - REST API ENDPOINTS
 * ═══════════════════════════════════════════════════════════════
 * 
 * This router handles all match-related HTTP endpoints:
 * - GET  /matches          → List all matches
 * - POST /matches          → Create a new match
 * 
 * PATTERN: Express Router
 * ───────────────────────
 * Routers are like mini Express apps that handle a specific resource.
 * This keeps code organized and modular.
 */

import { Router } from "express";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../validation/matches.js";
import { getMatchStatus } from "../utils/match-status.js";
import { desc } from "drizzle-orm"; // desc = descending order

// Create router instance
export const matchRouter = Router();

// Maximum allowed limit to prevent overload
// Even if user asks for limit=1000, we cap at 100
const MAX_LIMIT = 100;

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: GET /matches
// ═══════════════════════════════════════════════════════════════
/**
 * List all matches with pagination
 * 
 * QUERY PARAMETERS:
 * ─────────────────
 * ?limit=50  → Number of matches to return (default: 50, max: 100)
 * 
 * EXAMPLE REQUESTS:
 * ─────────────────
 * GET /matches              → Get 50 most recent matches
 * GET /matches?limit=10     → Get 10 most recent matches
 * 
 * RESPONSE:
 * ─────────
 * 200: {data: [{id: 1, homeTeam: "Arsenal", ...}, ...]}
 * 400: {error: "Invalid payload.", details: "..."}
 * 500: {error: "Failed to fetch matches.", details: "..."}
 */
matchRouter.get("/", async (req, res) => {
  // ─── Step 1: Validate Query Parameters ────────────────────────
  // req.query contains URL parameters like ?limit=50
  // safeParse validates without throwing errors
  const parsed = listMatchesQuerySchema.safeParse(req.query);
  
  if (!parsed.success) {
    // Return 400 Bad Request if validation fails
    return res.status(400).json({
      error: "Invalid payload.",
      details: JSON.stringify(parsed.error),
    });
  }
  
  // ─── Step 2: Apply Limit with Safety Cap ─────────────────────
  // parsed.data.limit ?? 50 means: use limit if provided, else 50
  // Math.min ensures it never exceeds MAX_LIMIT
  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);
  
  // ─── Step 3: Fetch from Database ──────────────────────────────
  try {
    const data = await db
      .select()                           // SELECT * (all columns)
      .from(matches)                      // FROM matches
      .limit(limit)                       // LIMIT 50
      .orderBy(desc(matches.createdAt));  // ORDER BY created_at DESC
    
    // Return data wrapped in object
    res.json({ data });
    
  } catch (e) {
    // Return 500 Internal Server Error if database fails
    res
      .status(500)
      .json({ error: "Failed to fetch matches.", details: JSON.stringify(e) });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: POST /matches
// ═══════════════════════════════════════════════════════════════
/**
 * Create a new match
 * 
 * REQUEST BODY:
 * ─────────────
 * {
 *   "sport": "football",
 *   "homeTeam": "Arsenal",
 *   "awayTeam": "Chelsea",
 *   "startTime": "2026-03-15T15:00:00Z",
 *   "endTime": "2026-03-15T17:00:00Z",
 *   "homeScore": 0,  // optional
 *   "awayScore": 0   // optional
 * }
 * 
 * WHAT HAPPENS:
 * ─────────────
 * 1. Validate request body
 * 2. Insert match into database
 * 3. Broadcast to all WebSocket clients (if available)
 * 4. Return created match
 * 
 * RESPONSE:
 * ─────────
 * 201: {message: "Match created successfully.", data: {...}}
 * 400: {error: "Invalid payload.", details: "..."}
 * 500: {error: "Failed to create match.", details: "..."}
 */
matchRouter.post("/", async (req, res) => {
  // ─── Step 1: Validate Request Body ────────────────────────────
  // req.body contains the JSON data sent by client
  const parsed = createMatchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload.",
      details: JSON.stringify(parsed.error),
    });
  }

  // ─── Step 2: Extract and Process Data ─────────────────────────
  const { startTime, endTime, homeScore, awayScore } = parsed.data;
  
  try {
    // ─── Step 3: Insert into Database ───────────────────────────
    // returning() makes Drizzle return the inserted row
    // Destructure [event] because returning() returns an array
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,                           // Spread all validated fields
        startTime: new Date(startTime),           // Convert string to Date
        endTime: new Date(endTime),               
        homeScore: homeScore || 0,                // Default to 0 if not provided
        awayScore: awayScore || 0,                
        status: getMatchStatus(startTime, endTime), // Auto-calculate status
      })
      .returning();
    
    // ─── Step 4: Broadcast to WebSocket Clients ──────────────────
    // Check if WebSocket broadcast function exists
    // (It's attached in src/index.js via app.locals)
    if (req.app.locals.broadcastMatchUpdate) {
      req.app.locals.broadcastMatchUpdate(event);
    }
    
    // ─── Step 5: Return Success Response ─────────────────────────
    // 201 Created = Successfully created new resource
    res
      .status(201)
      .json({ message: "Match created successfully.", data: event });
      
  } catch (e) {
    res
      .status(500)
      .json({ error: "Failed to create match.", details: JSON.stringify(e) });
  }
});
