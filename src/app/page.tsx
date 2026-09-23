import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/styles";
import { Wordmark } from "@/components/Wordmark";
import { getOptionalUser } from "@/lib/supabase/server";

export default async function Home() {
  const { userId } = await getOptionalUser();
  if (userId) redirect("/train");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col justify-center py-16">
        <Wordmark size="lg" />
        <p className="mt-2 text-muted">Workout Planner &amp; Tracker</p>
        <ul className="mt-10 space-y-4 text-[15px]">
          {[
            ["Plan splits", "Name your splits, build workouts and set targets for each exercise."],
            ["Log fast", "See last session's sets beside today's inputs. Confirm each set with one tap."],
            ["Keep your history", "History follows the exercise, whatever split or workout you change to."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span>
                <span className="font-medium">{title}.</span> <span className="text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3 pb-8">
        <Link href="/sign-in?mode=sign-up" className={buttonClass("primary", "lg", "w-full")}>
          Create account
        </Link>
        <Link href="/sign-in" className={buttonClass("secondary", "lg", "w-full")}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
