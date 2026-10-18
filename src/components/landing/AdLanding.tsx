import Link from "next/link";
import { IconCheck, IconCloudOff, IconDumbbell, IconHistory } from "../icons";
import { buttonClass } from "../styles";
import { Wordmark } from "../Wordmark";
import { COMPANY_LINE, CONTACT_EMAIL } from "@/lib/company";
import { Phone, STEPS } from "./Landing";

const SIGN_UP = "/sign-in?mode=sign-up";

const POINTS = [
  { icon: IconHistory, title: "Last session beside every set", body: "No more scrolling back through notes. The number to beat is right there." },
  { icon: IconDumbbell, title: "Told when to add weight", body: "Hit the top of your rep range on every set and NotchLift says it’s time to go heavier." },
  { icon: IconCloudOff, title: "Fast on the gym floor", body: "Weights filled in, one tap per set, and it works with no signal." },
];

/**
 * The page the hero-image ad links to: the same promise and the same screens as the ad, then
 * one choice: try a workout now with no account, or start free. Claims must stay true of the
 * product: no invented user counts, ratings or testimonials.
 */
export function AdLanding({ paidPlans = false }: { paidPlans?: boolean }) {
  const offer = paidPlans ? "14 days free · No card needed" : "Free during early access · No card needed";
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-fg">
      <header className="pt-safe">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="NotchLift home"><Wordmark size="md" /></Link>
          <Link href="/sign-in" className={buttonClass("ghost", "md", "px-4")}>Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[42rem] bg-[radial-gradient(50%_50%_at_50%_40%,rgb(195_237_137/0.16),transparent)]" />
          <div className="relative mx-auto max-w-3xl px-5 pt-6 pb-10 text-center">
            <h1 className="text-[2.4rem] leading-[1.06] font-bold tracking-[-0.035em] text-balance sm:text-6xl">
              The workout tracker that tells you when to add weight.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted text-pretty">
              Plan your split, log every set in seconds and see last session beside every set.
            </p>
            <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
              <Link href="/try" className={buttonClass("primary", "lg", "w-full text-[17px]")}>Try a workout now</Link>
              <p className="-mt-1 text-sm text-faint">No sign-up. Takes a minute.</p>
              <Link href={SIGN_UP} className={buttonClass("secondary", "lg", "w-full text-[17px]")}>Create a free account</Link>
              <p className="-mt-1 text-sm text-faint">{offer}</p>
            </div>
          </div>
          <div className="relative mx-auto h-[28rem] w-full max-w-[22rem] sm:h-[34rem] sm:max-w-[26rem]">
            <Phone src="/landing/target-hit.png" alt="" className="absolute top-12 right-0 w-[56%] rotate-[4deg]" />
            <Phone src="/landing/logger.png" alt="The NotchLift workout logger showing a bench press target of 70 kg for 6 reps" priority className="absolute top-0 left-0 z-10 w-[60%] -rotate-[3deg]" />
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-14">
          <ul className="space-y-4">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4 rounded-3xl border border-line bg-surface p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-text"><Icon size={20} /></span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-1 block text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-3xl px-5 py-14">
            <h2 className="text-center text-3xl font-bold tracking-[-0.03em]">How it works</h2>
            <ol className="mt-8 space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink">{i + 1}</span>
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="mt-1 block text-muted">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <ul className="mt-10 grid gap-2 text-sm text-muted sm:grid-cols-2">
              {["Works in your phone’s browser, no app store", "Kilograms or pounds", "Export your data any time", "No ads, no social feed"].map((t) => (
                <li key={t} className="flex gap-2"><IconCheck size={16} className="mt-0.5 shrink-0 text-accent-text" />{t}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-3xl px-5 py-14 text-center">
            <h2 className="text-3xl font-bold tracking-[-0.03em] text-balance">See it for yourself.</h2>
            <p className="mt-3 text-muted">Log a demo workout first. If you like it, your split is ready the moment you sign up.</p>
            <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
              <Link href="/try" className={buttonClass("primary", "lg", "w-full text-[17px]")}>Try a workout now</Link>
              <Link href={SIGN_UP} className={buttonClass("ghost", "lg", "w-full")}>Create a free account</Link>
            </div>
            <p className="mt-4 text-sm text-faint">{offer}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line pb-safe">
        <nav aria-label="Footer" className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-5 pt-8 text-sm text-muted">
          <Link href="/" className="hover:text-fg">More about NotchLift</Link>
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-fg">Contact</a>
        </nav>
        <p className="mx-auto max-w-3xl px-5 pt-4 pb-10 text-xs leading-relaxed text-faint">{COMPANY_LINE}</p>
      </footer>
    </div>
  );
}
