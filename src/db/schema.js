/**
 * ═══════════════════════════════════════════════════════════════
 * DATABASE SCHEMA - DRIZZLE ORM
 * ═══════════════════════════════════════════════════════════════
 * 
 * WHAT IS DRIZZLE ORM?
 * ───────────────────
 * Drizzle is a TypeScript-first ORM (Object-Relational Mapping) library.
 * It lets you define database tables using JavaScript/TypeScript instead of raw SQL.
 * 
 * BENEFITS:
 * - Type-safe queries
 * - Automatic SQL generation
 * - Easy migrations
 * - Works with PostgreSQL, MySQL, SQLite
 * 
 * THIS SCHEMA DEFINES TWO TABLES:
 * ────────────────────────────────
 * 1. matches - Sports matches (games/events)
 * 2. commentary - Play-by-play commentary for matches
 */

import {
    pgTable,     // Function to define PostgreSQL table
    pgEnum,      // Function to define PostgreSQL enum type
    serial,      // Auto-incrementing integer (1, 2, 3...)
    text,        // Variable-length text (like VARCHAR)
    integer,     // Integer number
    timestamp,   // Date and time
    jsonb,       // JSON data (stored as binary for efficiency)
} from 'drizzle-orm/pg-core';

// ═══════════════════════════════════════════════════════════════
// ENUMS - PREDEFINED OPTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Match Status Enum
 * 
 * WHAT IS AN ENUM?
 * An enum restricts a column to only accept specific values.
 * Like multiple choice: you can ONLY pick scheduled, live, or finished.
 * 
 * PostgreSQL creates this as a custom type in the database.
 */
export const matchStatusEnum = pgEnum('match_status', [
    'scheduled',  // Match hasn't started yet
    'live',       // Match is currently happening
    'finished',   // Match is over
]);

// ═══════════════════════════════════════════════════════════════
// TABLE: MATCHES
// ═══════════════════════════════════════════════════════════════

/**
 * Matches Table
 * 
 * Stores sports matches/games
 * Example: "Liverpool vs Arsenal - Premier League"
 */
export const matches = pgTable('matches', {
    // Primary key: unique ID for each match (1, 2, 3...)
    // serial = auto-incrementing integer
    id: serial('id').primaryKey(),
    
    // Sport type: "football", "basketball", "tennis", etc.
    sport: text('sport').notNull(),
    
    // Team names
    homeTeam: text('home_team').notNull(),
    awayTeam: text('away_team').notNull(),
    
    // Match status: scheduled/live/finished
    // Uses the enum we defined above
    // default('scheduled') means new matches start as "scheduled"
    status: matchStatusEnum('status').default('scheduled').notNull(),
    
    // When match starts/ends
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),  // nullable because match might not be scheduled yet
    
    // Current scores
    // default(0) means scores start at 0
    homeScore: integer('home_score').default(0).notNull(),
    awayScore: integer('away_score').default(0).notNull(),
    
    // When this record was created
    // defaultNow() automatically sets to current timestamp
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════
// TABLE: COMMENTARY
// ═══════════════════════════════════════════════════════════════

/**
 * Commentary Table  
 * 
 * Stores play-by-play events for matches
 * Example: "15' - GOAL! Messi scores from outside the box!"
 * 
 * RELATIONSHIP:
 * Each commentary entry belongs to ONE match (via matchId)
 * One match can have MANY commentary entries
 * This is called a ONE-TO-MANY relationship
 */
export const commentary = pgTable('commentary', {
    // Primary key: unique ID for each commentary entry
    id: serial('id').primaryKey(),
    
    // ─── FOREIGN KEY RELATIONSHIP ────────────────────────────────
    // Foreign key: links to matches table
    // references(() => matches.id) means matchId must exist in matches table
    // onDelete: 'cascade' means: if match is deleted, delete all its commentary too
    matchId: integer('match_id')
        .notNull()
        .references(() => matches.id, { onDelete: 'cascade' }),
    
    // ─── TIMING INFO ───────────────────────────────────────────
    // Match minute when event happened (e.g., 45 = 45th minute)
    minute: integer('minute').notNull(),
    
    // Sequence number for ordering events in same minute
    // Example: minute 45 might have 3 events, sequence 1,2,3
    sequence: integer('sequence').notNull(),
    
    // Which period of the match: "first_half", "second_half", "extra_time"
    period: text('period').notNull(),
    
    // ─── EVENT DETAILS ───────────────────────────────────────────
    // Type of event: "goal", "yellow_card", "substitution", etc.
    eventType: text('event_type').notNull(),
    
    // Who did it: player name (optional - not all events have an actor)
    actor: text('actor'),
    
    // Which team: "home" or "away" (optional)
    team: text('team'),
    
    // The actual commentary text
    // Example: "Incredible goal from Ronaldo!"
    message: text('message').notNull(),
    
    // ─── FLEXIBLE DATA ────────────────────────────────────────────
    // JSONB field: can store any JSON data
    // Example: {"assist": "Messi", "distance": "25 yards"}
    // Good for flexible, varying data
    metadata: jsonb('metadata'),
    
    // Array of tags: ["highlight", "goal", "home_team"]
    // PostgreSQL supports native arrays
    tags: text('tags').array(),
    
    // When this commentary was created
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
