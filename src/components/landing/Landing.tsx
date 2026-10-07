import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { IconChart, IconCheck, IconCloudOff, IconDumbbell, IconHistory, IconLayers, IconShare, IconTimer, IconArrowUpRight } from "../icons";
import { buttonClass, cx } from "../styles";
import { Wordmark } from "../Wordmark";

/**
 * Public landing page (signed-out visitors to /). Every screenshot is the real app, captured
 * from a demo account with sample data (tests/marketing/screenshots.spec.ts). Claims here must
 * stay true of the product: no invented user counts, ratings or testimonials.
 */

const SIGN_UP = "/sign-in?mode=sign-up";

function Phone({ src, alt, priority, className }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={cx("rounded-[2.75rem] border border-white/10 bg-[#0b0c0d] p-2.5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.65)]", className)}>
      <div className="overflow-hidden rounded-[2.2rem]">
        <Image src={src} alt={alt} width={1170} height={2532} priority={priority} sizes="(min-width: 1024px) 320px, 70vw" className="block h-auto w-full" />
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold tracking-[0.18em] text-accent-text uppercase">{children}</p>;
}

function Cta({ className, label = "Start free" }: { className?: string; label?: string }) {
  return (
    <Link href={SIGN_UP} className={buttonClass("primary", "lg", cx("px-7 text-[17px]", className))}>
      {label}
    </Link>
  );
}

const FACTS = [
  { icon: IconCloudOff, label: "Works with no signal" },
  { icon: IconDumbbell, label: "Kilograms or pounds" },
  { icon: IconHistory, label: "Export your data any time" },
  { icon: IconCheck, label: "No ads, no social feed" },
];

const STEPS = [
  { title: "Pick your split", body: "Start from Push / Pull / Legs, Upper / Lower or Full Body, or build your own workouts with sets, rep ranges and rest times." },
  { title: "Log every set", body: "Last session sits beside every set, weights are filled in, and one tap records it. The rest timer starts itself if you want it to." },
  { title: "Get told when to go up", body: "Hit the top of your rep range on every set and NotchLift gives you your next weight. Miss it, and it tells you how many reps to chase." },
];

const FEATURES: { eyebrow: string; title: string; body: string; points: string[]; src: string; alt: string }[] = [
  {
    eyebrow: "Logging",
    title: "Last session, right beside this one.",
    body: "No scrolling back through notes or guessing what you did last week. Every set shows what you lifted last time, so you always know the number to beat.",
    points: ["Weights carried over from last time", "One tap to confirm a set, one tap to undo", "Warm-ups kept separate from working sets"],
    src: "/landing/logger.png",
    alt: "The NotchLift workout logger: barbell bench press with last session's sets beside today's and a target of 70 kg for 6 reps",
  },
  {
    eyebrow: "Progressive overload",
    title: "Knows when it’s time to add weight.",
    body: "Switch on targets for an exercise and NotchLift applies double progression for you: more reps until you own the range, then more weight. When you hit it, you’ll know.",
    points: ["Your increment: 2.5 kg plates, 2 kg dumbbells or 5 lb jumps", "Only compares like with like, so targets stay honest", "Suggestions only; nothing is logged until you confirm it"],
    src: "/landing/target-hit.png",
    alt: "A completed bench press with the message Target hit, every set at 70 kg for 6 or better",
  },
  {
    eyebrow: "Progress",
    title: "Watch every lift climb.",
    body: "Charts for estimated 1RM, volume and heaviest set on every exercise, plus your records. History follows the exercise, so changing your split never resets your progress.",
    points: ["Estimated 1RM, volume and heaviest set", "Records recalculated whenever you edit a workout", "Filter by split or training block"],
    src: "/landing/progress.png",
    alt: "A NotchLift progress chart showing the heaviest bench press set rising from 60 kg to 67.5 kg over twelve weeks",
  },
  {
    eyebrow: "Your plan",
    title: "Always know what’s next.",
    body: "Open the app and your next workout is waiting: whichever one in your split you did longest ago. Start it in one tap, or log a quick one-off session.",
    points: ["Next workout suggested from your active split", "Log workouts afterwards with the right date", "Share a split with a friend; your numbers stay private"],
    src: "/landing/train.png",
    alt: "The NotchLift home screen suggesting Push as the next workout in a Push / Pull / Legs split",
  },
];

const GRID = [
  { icon: IconCloudOff, title: "Built for basement gyms", body: "Everything saves on your phone first and syncs when you’re back online. No signal, no problem." },
  { icon: IconTimer, title: "Rest timer that keeps time", body: "Counts from the clock, not the screen, so it stays right when your phone locks." },
  { icon: IconChart, title: "Records you can trust", body: "Heaviest load, best estimated 1RM and most reps, worked out from your real history." },
  { icon: IconLayers, title: "Splits that evolve", body: "Change programmes as often as you like. Every exercise keeps its full history." },
  { icon: IconShare, title: "Share a split", body: "Send your programme to a training partner. They get the plan, never your weights." },
  { icon: IconDumbbell, title: "Kilograms or pounds", body: "Train in kg or lb. Switch any time and everything converts exactly." },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is there an app to download?",
    a: "NotchLift runs in your phone’s browser, so there’s nothing to install from an app store. Add it to your home screen and it opens full screen with its own icon, just like any other app. It works on iPhone and Android.",
  },
  {
    q: "Does it work without signal?",
    a: "Yes. Every set is saved on your phone the moment you log it and syncs to your account when you’re back online. You can start and finish a whole workout underground.",
  },
  {
    q: "I don’t have a programme. Can I still use it?",
    a: "Pick a ready-made split (Push / Pull / Legs, Upper / Lower or Full Body) when you sign up. Every exercise, set count and rep range can be changed later, and your history comes with you.",
  },
  {
    q: "How do targets work?",
    a: "Targets use double progression. If every working set reached the top of your rep range last time, your target adds your chosen increment. If not, it keeps the weight and aims for more reps. They’re suggestions: nothing counts until you confirm a set.",
  },
  {
    q: "Who can see my workouts?",
    a: (
      <>
        Only you. There are no public profiles and no feed. Sharing a split shares its structure, never your numbers. You can export everything as a spreadsheet or JSON, or delete your account, at any time.{" "}
        <Link href="/privacy" className="text-accent-text underline underline-offset-4">Privacy notice</Link>
      </>
    ),
  },
  {
    q: "What does it cost?",
    a: "NotchLift is free during early access, with no card needed. Everyone who joins now is a founding member. If pricing ever changes, you’ll hear from us first, and nothing is ever charged automatically.",
  },
];

export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-fg">
      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 pt-safe backdrop-blur-xl">
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" aria-label="NotchLift home"><Wordmark size="md" /></Link>
          <div className="hidden items-center gap-8 text-sm text-muted md:flex">
            <a href="#features" className="hover:text-fg">Features</a>
            <a href="#how-it-works" className="hover:text-fg">How it works</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
            <a href="#faq" className="hover:text-fg">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className={buttonClass("ghost", "md", "px-4")}>Sign in</Link>
            <Link href={SIGN_UP} className={buttonClass("primary", "md", "px-4")}>Start free</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[42rem] bg-[radial-gradient(50%_50%_at_60%_40%,rgb(195_237_137/0.16),transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-20 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:pb-28">
            <div className="text-center lg:text-left">
              <Eyebrow>Workout planner &amp; tracker</Eyebrow>
              <h1 className="mt-5 text-[2.6rem] leading-[1.04] font-bold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.25rem]">
                Know exactly what to lift next.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted text-pretty lg:mx-0 lg:text-xl">
                NotchLift plans your split, puts last session beside every set, and tells you when it’s time to add weight. Fast enough for the gym floor, and it works without signal.
              </p>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Cta className="w-full sm:w-auto" label="Start training free" />
                <a href="#how-it-works" className={buttonClass("secondary", "lg", "w-full px-7 sm:w-auto")}>See how it works</a>
              </div>
              <p className="mt-5 text-sm text-faint">Free during early access · No card needed · iPhone &amp; Android</p>
            </div>
            <div className="relative mx-auto h-[31rem] w-full max-w-[22rem] sm:h-[36rem] sm:max-w-[26rem]">
              <Phone src="/landing/target-hit.png" alt="" className="absolute top-12 right-0 w-[56%] rotate-[4deg]" />
              <Phone src="/landing/logger.png" alt="The NotchLift workout logger showing a bench press target of 70 kg for 6 reps" priority className="absolute top-0 left-0 z-10 w-[60%] -rotate-[3deg]" />
            </div>
          </div>
        </section>

        {/* Facts */}
        <section aria-label="At a glance" className="border-y border-line bg-surface/50">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-7 md:grid-cols-4">
            {FACTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center justify-center gap-2.5 text-sm font-medium text-fg/90 md:text-[15px]">
                <Icon size={18} className="shrink-0 text-accent-text" /> {label}
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">Plan it. Log it. Beat it.</h2>
            <p className="mt-4 text-lg text-muted">Three steps, every session, and the app does the remembering.</p>
          </div>
          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-3xl border border-line bg-surface p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-bold text-accent-ink tabular">{i + 1}</span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Feature sections */}
        <div id="features" className="scroll-mt-20">
          {FEATURES.map((f, i) => (
            <section key={f.title} className={cx("border-t border-line", i % 2 === 1 && "bg-surface/40")}>
              <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:gap-16 md:py-28">
                <div className={cx(i % 2 === 1 && "md:order-2")}>
                  <Eyebrow>{f.eyebrow}</Eyebrow>
                  <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-balance sm:text-[2.75rem] sm:leading-[1.08]">{f.title}</h2>
                  <p className="mt-5 text-lg leading-relaxed text-muted">{f.body}</p>
                  <ul className="mt-7 space-y-3">
                    {f.points.map((p) => (
                      <li key={p} className="flex gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"><IconCheck size={14} /></span>
                        <span className="text-fg/90">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="relative mx-auto w-full max-w-[19rem]">
                  <div aria-hidden="true" className="absolute inset-0 -z-0 scale-110 rounded-full bg-[radial-gradient(closest-side,rgb(195_237_137/0.14),transparent)]" />
                  <Phone src={f.src} alt={f.alt} className="relative" />
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Feature grid */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>And the details</Eyebrow>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">Made for real gym sessions.</h2>
            </div>
            <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {GRID.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-3xl border border-line bg-surface p-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-text"><Icon size={22} /></span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t border-line bg-surface/40">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <div className="mx-auto max-w-2xl text-center">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">Free during early access.</h2>
              <p className="mt-4 text-lg text-muted">Every feature, no card, no catch. Join now and you’re a founding member.</p>
            </div>
            <div className="mx-auto mt-12 max-w-md rounded-[2rem] border border-accent-text/40 bg-surface p-8 shadow-[0_0_0_6px_rgb(195_237_137/0.06)]">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-xl font-semibold">Founding member</h3>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-text">Early access</span>
              </div>
              <p className="mt-4"><span className="text-5xl font-bold tracking-tight">Free</span></p>
              <ul className="mt-7 space-y-3">
                {["Unlimited splits, workouts and history", "Targets, records and progress charts", "Offline logging and rest timer", "Kilograms or pounds", "Spreadsheet and JSON export"].map((p) => (
                  <li key={p} className="flex gap-3">
                    <IconCheck size={18} className="mt-0.5 shrink-0 text-accent-text" />
                    <span className="text-fg/90">{p}</span>
                  </li>
                ))}
              </ul>
              <Cta className="mt-8 w-full" label="Become a founding member" />
              <p className="mt-4 text-center text-sm text-faint">If pricing ever changes, you’ll hear from us first.</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line">
          <div className="mx-auto max-w-3xl px-5 py-24">
            <div className="text-center">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.03em] sm:text-5xl">Questions, answered.</h2>
            </div>
            <div className="mt-12 divide-y divide-line rounded-3xl border border-line bg-surface">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                    {q}
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="border-t border-line">
          <div className="relative mx-auto max-w-6xl px-5 py-24">
            <div className="relative overflow-hidden rounded-[2.5rem] bg-accent px-6 py-16 text-center text-accent-ink sm:px-12">
              <h2 className="text-3xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">Your next PR starts with your next set.</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-accent-ink/80">Set up your split in under a minute. Free during early access.</p>
              <Link href={SIGN_UP} className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#131416] px-8 text-[17px] font-semibold text-[#eaebed] transition hover:bg-black">
                Start training free <IconArrowUpRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line pb-safe">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Wordmark size="sm" className="text-fg" />
            <p className="mt-1 text-faint">Workout planner &amp; tracker</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/sign-in" className="hover:text-fg">Sign in</Link>
            <Link href="/privacy" className="hover:text-fg">Privacy</Link>
            <Link href="/terms" className="hover:text-fg">Terms</Link>
            <a href="mailto:hello@notchlift.com" className="hover:text-fg">hello@notchlift.com</a>
          </nav>
          <p className="text-faint">© {new Date().getFullYear()} NotchLift</p>
        </div>
      </footer>
    </div>
  );
}
