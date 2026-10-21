import Image from "next/image";
import { FOUNDER_NAME } from "@/lib/company";

/** Who's behind NotchLift: a real photo and a few words from the founder, for trust. */
export function Founder({ className }: { className?: string }) {
  return (
    <section aria-labelledby="founder-title" className={className}>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 py-16 text-center sm:flex-row sm:items-start sm:gap-8 sm:text-left">
        <Image src="/landing/ben.jpg" alt={`${FOUNDER_NAME} Thompson, founder of NotchLift`} width={640} height={640} sizes="128px" className="h-28 w-28 shrink-0 rounded-full object-cover sm:h-32 sm:w-32" />
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent-text uppercase">Why I built it</p>
          <h2 id="founder-title" className="sr-only">From the founder</h2>
          <blockquote className="mt-3 text-xl leading-relaxed font-medium tracking-tight text-balance sm:text-[1.35rem]">
            “I logged every set in my Notes app, scrolled back between sets to find last week’s numbers, and still guessed when to add weight. So I built
            the tracker I wanted: last time beside every set, and a clear sign when it’s time to go heavier.”
          </blockquote>
          <p className="mt-4 font-medium">{FOUNDER_NAME} Thompson <span className="font-normal text-muted">· Founder, NotchLift · Norfolk, UK</span></p>
          <p className="mt-2 text-sm text-muted">Questions or ideas? Message me from Help &amp; support in the app. I read and reply to every one.</p>
        </div>
      </div>
    </section>
  );
}
