import Link from "next/link";
import { buttonClass } from "@/components/styles";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pt-safe pb-safe">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">This page does not exist, or it belongs to another account.</p>
      <Link href="/train" className={buttonClass("primary", "lg", "mt-8")}>Go to Train</Link>
    </main>
  );
}
