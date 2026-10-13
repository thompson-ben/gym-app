import { SITE_URL } from "./site";

/** Days of trial a member earns, once, when a friend they invited starts training. */
export const REFERRAL_DAYS = 14;

export type ReferralStatus = { code: string | null; invited: number; training: number; rewarded_at: string | null };

export const inviteLink = (code: string) => `${SITE_URL}/?ref=${code}`;

export const inviteMessage = (code: string) =>
  `I’ve been tracking my lifts with NotchLift. It shows last session beside every set and tells you when to add weight. Try it free for 14 days: ${inviteLink(code)}`;
