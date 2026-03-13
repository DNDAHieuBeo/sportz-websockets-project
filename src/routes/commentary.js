/**
 * ═══════════════════════════════════════════════════════════════
 * COMMENTARY ROUTER - REST API ENDPOINTS
 * ═══════════════════════════════════════════════════════════════
 * 
 * This router handles commentary for specific matches.
 * It's a NESTED router mounted at /matches/:id/commentary
 * 
 * ENDPOINTS:
 * - GET  /matches/:id/commentary  → List commentary for match
 * - POST /matches/:id/commentary  → Add new commentary
 * 
 * NESTED ROUTING EXPLAINED:
 * ─────────────────────────
 * This router is mounted under /matches/:id/commentary
 * So GET "/" in this router becomes GET /matches/:id/commentary
 * The :id param is available in req.params.id
 */

import { Router } from "express";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { matchIdParamSchema } from "../validation/matches.js";
import { listCommentaryQuerySchema, createCommentarySchema } from "../validation/commentary.js";
import { desc, eq } from "drizzle-orm"; // desc = descending, eq = equals

export const commentaryRouter = Router();

// Maximum allowed commentary entries per request
const MAX_LIMIT = 100;

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: GET /matches/:id/commentary
// ═══════════════════════════════════════════════════════════════
/**
 * List commentary for a specific match
 * 
 * URL PARAMETERS:
 * ───────────────
 * :id  → Match ID (e.g., /matches/5/commentary)
 * 
 * QUERY PARAMETERS:
 * ─────────────────
 * ?limit=100  → Number of entries to return (default: 100, max: 100)
 * 
 * EXAMPLE REQUESTS:
 * ─────────────────
 * GET /matches/1/commentary          → Get 100 most recent commentary entries
 * GET /matches/1/commentary?limit=20 → Get 20 most recent entries
 * 
 * ORDERING:
 * ─────────
 * Results are ordered by createdAt DESC (newest first)
 * So the most recent commentary appears at the top
 * 
 * RESPONSE:
 * ─────────
 * 200: {data: [{id: 1, minute: 45, message: "GOAL!", ...}, ...]}
 * 400: {error: "Invalid params.", details: "..."}
 * 500: {error: "Failed to fetch commentary.", details: "..."}
 */
commentaryRouter.get("/", async (req, res) => {
  // ─── Step 1: Validate URL Parameter (match ID) ───────────────
  // req.params.id comes from /matches/:id/commentary
  const paramsValidation = matchIdParamSchema.safeParse(req.params);
  
  if (!paramsValidation.success) {
    return res.status(400).json({
      error: "Invalid params.",
      details: JSON.stringify(paramsValidation.error),
    });
  }

  // ─── Step 2: Validate Query Parameters ────────────────────────
  // req.query contains ?limit=20
  const queryValidation = listCommentaryQuerySchema.safeParse(req.query);
  
  if (!queryValidation.success) {
    return res.status(400).json({
      error: "Invalid query parameters.",
      details: JSON.stringify(queryValidation.error),
    });
  }

  // ─── Step 3: Extract Validated Data ───────────────────────────
  const { id: matchId } = paramsValidation.data;
  const limit = Math.min(queryValidation.data.limit ?? 100, MAX_LIMIT);

  // ─── Step 4: Fetch from Database ──────────────────────────────
  try {
    const data = await db
      .select()                                  // SELECT *
      .from(commentary)                          // FROM commentary
      .where(eq(commentary.matchId, matchId))    // WHERE match_id = ?
      .orderBy(desc(commentary.createdAt))       // ORDER BY created_at DESC
      .limit(limit);                             // LIMIT ?

    res.json({ data });
    
  } catch (e) {
    res.status(500).json({
      error: "Failed to fetch commentary.",
      details: JSON.stringify(e),
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: POST /matches/:id/commentary
// ═══════════════════════════════════════════════════════════════
/**
 * Add new commentary event to a match
 * 
 * REQUEST BODY:
 * ─────────────
 * {
 *   "minute": 45,
 *   "sequence": 1,               // optional
 *   "period": "first_half",      // optional
 *   "eventType": "goal",         // optional
 *   "actor": "Messi",            // optional
 *   "team": "home",              // optional
 *   "message": "GOAL! Amazing strike!",
 *   "metadata": {...},           // optional JSON
 *   "tags": ["highlight", "goal"] // optional
 * }
 * 
 * WHAT HAPPENS:
 * ─────────────
 * 1. Validate match ID from URL
 * 2. Validate request body
 * 3. Insert commentary into database
 * 4. Broadcast to WebSocket subscribers of this match
 * 5. Return created commentary
 * 
 * WEBSOCKET BROADCAST:
 * ────────────────────
 * Only clients SUBSCRIBED to this specific match receive the update.
 * This is different from match creation, which broadcasts to ALL clients.
 * 
 * RESPONSE:
 * ─────────
 * 201: {data: {...}}
 * 400: {error: "Invalid ...", details: [...]}
 * 500: {error: "Failed to create commentary."}
 */
commentaryRouter.post("/", async (req, res) => {
  // ─── Step 1: Validate Match ID ────────────────────────────────
  const paramsResult = matchIdParamSchema.safeParse(req.params);

  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID.", details: paramsResult.error.issues });
  }

  // ─── Step 2: Validate Request Body ────────────────────────────
  const bodyResult = createCommentarySchema.safeParse(req.body);

  if (!bodyResult.success) {
    return res
      .status(400)
      .json({
        error: "Invalid commentary payload.",
        details: bodyResult.error.issues,
      });
  }

  // ─── Step 3: Insert into Database ─────────────────────────────
  try {
    // Destructure minute separately, spread the rest
    const { minute, ...rest } = bodyResult.data;
    
    const [result] = await db
      .insert(commentary)
      .values({
        matchId: paramsResult.data.id,    // From URL param
        minute,                            // Required field
        ...rest,                           // All other validated fields
      })
      .returning();

    // ─── Step 4: Broadcast to WebSocket Subscribers ───────────────
    // Only notify clients subscribed to THIS specific match
    if (res.app.locals.broadcastCommentary) {
      res.app.locals.broadcastCommentary(result.matchId, result);
    }

    // ─── Step 5: Return Success Response ──────────────────────────
    res.status(201).json({ data: result });
    
  } catch (error) {
    console.error("Failed to create commentary:", error);
    res.status(500).json({ error: "Failed to create commentary." });
  }
});
