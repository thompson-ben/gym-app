"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { IconCheck } from "../icons";
import { buttonClass } from "../styles";
import { Spinner } from "../ui";

/** After Stripe Checkout: waits (briefly) for Stripe's confirmation to reach the account. */
export function PaymentConfirmation() {
  const [state, setState] = useState<"waiting" | "done" | "slow">("waiting");
  useEffect(() => {
    let tries = 0;
    let stop = false;
    async function check() {
      const { data } = await supabaseBrowser().from("memberships").select("status").maybeSingle();
      if (stop) return;
      if (data?.status === "paid" || data?.status === "founder") return setState("done");
      if (++tries >= 15) return setState("slow");
      setTimeout(check, 2000);
    }
    void check();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className="pt-safe">
      <div className="pt-16 text-center">
        {state === "waiting" ? (
          <>
            <Spinner className="mx-auto h-8 w-8" />
            <h1 className="mt-6 text-2xl font-semibold">Confirming your payment…</h1>
            <p className="mt-2 text-muted">This usually takes a few seconds.</p>
          </>
        ) : state === "done" ? (
          <>
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink"><IconCheck size={32} /></span>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">You’re a member</h1>
            <p className="mt-2 text-muted">Thanks for backing NotchLift. Keep lifting.</p>
            <Link href="/train" className={buttonClass("primary", "lg", "mt-8 w-full")}>Go to Train</Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Payment received, still confirming</h1>
            <p className="mt-2 text-muted">Stripe is taking a little longer than usual. Your membership will switch on by itself shortly; you don’t need to pay again.</p>
            <Link href="/train" className={buttonClass("secondary", "lg", "mt-8 w-full")}>Go to Train</Link>
          </>
        )}
      </div>
    </div>
  );
}
