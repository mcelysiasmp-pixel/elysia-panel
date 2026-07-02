"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { CLIENT_NAV, ADMIN_NAV } from "./nav-items";
import { Sparkles } from "lucide-react";

export function PanelSidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold">
        <Sparkles className="size-5 text-primary" />
        Elysia Panel
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        <NavGroup items={CLIENT_NAV} pathname={pathname} />
        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-2 text-xs font-medium uppercase text-muted-foreground">Administration</div>
            <NavGroup items={ADMIN_NAV} pathname={pathname} />
          </>
        )}
      </nav>
    </aside>
  );
}

function NavGroup({ items, pathname }: { items: typeof CLIENT_NAV; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/50",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
