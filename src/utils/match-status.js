/**
 * ═══════════════════════════════════════════════════════════════
 * MATCH STATUS UTILITIES
 * ═══════════════════════════════════════════════════════════════
 * 
 * Helper functions to determine match status based on time
 */

import { MATCH_STATUS } from '../validation/matches.js';

/**
 * Determine match status based on start/end times
 * 
 * LOGIC:
 * ──────
 * - If current time is BEFORE startTime → scheduled
 * - If current time is AFTER endTime → finished  
 * - If current time is BETWEEN start and end → live
 * 
 * EXAMPLE:
 * Match: 2:00 PM - 4:00 PM
 * - At 1:00 PM → "scheduled"
 * - At 3:00 PM → "live"
 * - At 5:00 PM → "finished"
 * 
 * @param {Date|string} startTime - When match starts
 * @param {Date|string} endTime - When match ends
 * @param {Date} now - Current time (defaults to now, but can override for testing)
 * @returns {string|null} - Match status or null if dates are invalid
 */
export function getMatchStatus(startTime, endTime, now = new Date()) {
    // Convert to Date objects if they're strings
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Validate dates - Date.parse returns NaN for invalid dates
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null; // Invalid date, can't determine status
    }

    // Check time ranges
    if (now < start) {
        return MATCH_STATUS.SCHEDULED; // Match hasn't started yet
    }

    if (now >= end) {
        return MATCH_STATUS.FINISHED; // Match is over
    }

    return MATCH_STATUS.LIVE; // Match is currently happening
}

/**
 * Sync match status and update database if status changed
 * 
 * This function:
 * 1. Calculates what the status SHOULD be
 * 2. Compares with current status
 * 3. Updates database if they don't match
 * 
 * USE CASE:
 * Run this periodically (e.g., every minute) to automatically
 * transition matches from scheduled → live → finished
 * 
 * @param {object} match - Match object with startTime, endTime, status
 * @param {function} updateStatus - Async function to update status in DB
 * @returns {string} - The new/current status
 */
export async function syncMatchStatus(match, updateStatus) {
    // Calculate what status should be based on current time
    const nextStatus = getMatchStatus(match.startTime, match.endTime);
    
    if (!nextStatus) {
        return match.status; // Can't determine status, keep current
    }
    
    // If status changed, update in database
    if (match.status !== nextStatus) {
        await updateStatus(nextStatus);
        match.status = nextStatus; // Update in-memory object too
    }
    
    return match.status;
}