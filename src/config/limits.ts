/**
 * Free-tier limits. PRO users are never limited.
 */

/** Number of chat messages a free user can send before needing to watch an ad. */
export const FREE_MESSAGE_LIMIT = 20;

/** Extra messages granted each time a free user watches a rewarded ad. */
export const REWARD_MESSAGE_BONUS = 10;

/** How long a rewarded-unlocked background stays unlocked (ms). */
export const REWARD_BACKGROUND_UNLOCK_MS = 30 * 60 * 1000; // 30 minutes
