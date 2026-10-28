import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applePayment, eventUserId, isAppleRefund, type RevenueCatEvent } from "@/lib/billing/apple";
import { syncAppleSubscription } from "@/lib/billing/revenuecat";
import { billingSecret } from "@/lib/billing/server";
import { supabaseAnon } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || expected.length < 32 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * RevenueCat → NotchLift, for App Store subscriptions bought in the iOS app. RevenueCat sends
 * "Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH>". Real payments and refunds are recorded,
 * then the membership is brought in line with RevenueCat. Failures answer 500 so it retries.
 */
export async function POST(request: Request) {
  const secret = billingSecret();
  if (!secret || !process.env.REVENUECAT_SECRET_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { event?: RevenueCatEvent } | null;
  const event = body?.event;
  if (!event) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const userId = eventUserId(event);
  // Test events from the dashboard, and anonymous buyers who never signed in: nothing to do.
  if (event.type === "TEST" || !userId) return NextResponse.json({ ok: true });

  const db = supabaseAnon();
  const payment = applePayment(event);
  if (payment) {
    const { error } = await db.rpc("apple_record_payment", {
      p_secret: secret,
      p_user: userId,
      p_transaction: payment.transaction,
      p_amount_pence: payment.pence,
      p_currency: payment.currency,
      p_plan: payment.plan,
      p_paid_at: payment.paidAt,
    });
    if (error && error.code !== "23503") return NextResponse.json({ error: "record failed" }, { status: 500 });
  }
  if (isAppleRefund(event)) {
    const { error } = await db.rpc("apple_mark_refunded", { p_secret: secret, p_transaction: event.transaction_id });
    if (error) return NextResponse.json({ error: "refund failed" }, { status: 500 });
  }
  const result = await syncAppleSubscription(userId);
  if (result === "error") return NextResponse.json({ error: "sync failed" }, { status: 500 });
  return NextResponse.json({ ok: true, result });
}
