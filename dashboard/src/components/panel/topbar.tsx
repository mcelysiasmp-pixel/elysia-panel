"use client";

import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Moon, Sun, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function PanelTopbar() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="flex h-14 items-center justify-end gap-2 border-b px-4">
      <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        <Sun className="size-4 scale-100 dark:scale-0 transition-transform" />
        <Moon className="absolute size-4 scale-0 dark:scale-100 transition-transform" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
          <Avatar className="size-7">
            <AvatarFallback>{user?.username?.slice(0, 2).toUpperCase() ?? "??"}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{user?.username}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/account")}>
            <UserIcon className="mr-2 size-4" />
            Mon profil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={logout} variant="destructive">
            <LogOut className="mr-2 size-4" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
