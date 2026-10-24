/** Account and session rules, shared by the auth setup and the settings page. */
/** 30 minutes idle (rolling). */
export const IDLE_SECONDS = 30 * 60;
/** 12 hours absolute, however active. */
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** How long an invite or reset link works. */
export const INVITE_TTL_SECONDS = 48 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;
