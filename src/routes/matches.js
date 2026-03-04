import { Router } from "express";
import { db } from "../db/db.js";
import { matches } from "../db/schema.js";
import {
    createMatchSchema,
    listMatchesQuerySchema,
} from "../validation/matches.js";
import { getMatchStatus } from "../utils/match-status.js";
import { desc } from "drizzle-orm";

export const matchRouter = Router();
const MAX_LIMIT = 100;
matchRouter.get("/", async (req, res) => {
    const parsed = listMatchesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
                error: "Invalid payload.",
                details: JSON.stringify(parsed.error),
            });
    }
    const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);
    try {
        const data = await db
            .select()
            .from(matches)
            .limit(limit)
            .orderBy(desc(matches.createdAt));
        res.json({ data });
    } catch (e) {
        res
            .status(500)
            .json({ error: "Failed to fetch matches.", details: JSON.stringify(e) });
    }
});

matchRouter.post("/", async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body);

    if (!parsed.success) {
        return res
            .status(400)
            .json({
                error: "Invalid payload.",
                details: JSON.stringify(parsed.error),
            });
    }

    const { startTime, endTime, homeScore, awayScore } = parsed.data;
    try {
        const [event] = await db
            .insert(matches)
            .values({
                ...parsed.data,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                homeScore: homeScore || 0,
                awayScore: awayScore || 0,
                status: getMatchStatus(startTime, endTime),
            })
            .returning();
        res
            .status(201)
            .json({ message: "Match created successfully.", data: event });
    } catch (e) {
        res
            .status(500)
            .json({ error: "Failed to create match.", details: JSON.stringify(e) });
    }
});
