/**
 * ═══════════════════════════════════════════════════════════════
 * DATABASE CONNECTION - POSTGRESQL
 * ═══════════════════════════════════════════════════════════════
 * 
 * This file sets up the database connection using:
 * 1. pg (node-postgres): PostgreSQL client for Node.js
 * 2. Drizzle ORM: Type-safe database queries
 * 
 * WHAT IS A CONNECTION POOL?
 * ──────────────────────────
 * Instead of creating a new database connection for every query,
 * we create a POOL of reusable connections.
 * 
 * Benefits:
 * - Faster: Reuse existing connections
 * - Efficient: Limit total number of connections
 * - Reliable: Automatically handles connection failures
 * 
 * Think of it like a swimming pool: multiple people can use it,
 * but there's a maximum capacity.
 */

// Load environment variables from .env file
// This lets us keep secrets (like DATABASE_URL) out of our code
import 'dotenv/config';

// Drizzle ORM adapter for PostgreSQL
import { drizzle } from 'drizzle-orm/node-postgres';

// PostgreSQL client library
import pg from 'pg';
const { Pool } = pg;

// ─── Validate Environment Variable ────────────────────────────────
// Ensure DATABASE_URL exists before starting the server
// Example: DATABASE_URL=postgresql://user:password@localhost:5432/mydb
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
}

// ─── Create Connection Pool ──────────────────────────────────────
// Pool manages multiple PostgreSQL connections
// By default: max 10 connections, idle timeout 30s
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// ─── Create Drizzle Instance ───────────────────────────────────────
// Wrap the pool with Drizzle ORM for easy querying
// This 'db' object is imported throughout the app
// 
// Usage example:
//   await db.select().from(matches).where(eq(matches.id, 1))
export const db = drizzle(pool);
