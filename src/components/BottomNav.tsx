"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChart, IconDumbbell, IconLayers, IconUser } from "./icons";
import { cx } from "./styles";

const ITEMS = [
  { href: "/train", label: "Train", Icon: IconDumbbell },
  { href: "/splits", label: "Splits", Icon: IconLayers },
  { href: "/progress", label: "Progress", Icon: IconChart },
  { href: "/profile", label: "Profile", Icon: IconUser },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur-lg pb-safe">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/progress" && pathname.startsWith("/sessions"));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition", active ? "text-fg" : "text-faint hover:text-muted")}
              >
                <Icon size={22} className={active ? "text-accent-text" : undefined} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
