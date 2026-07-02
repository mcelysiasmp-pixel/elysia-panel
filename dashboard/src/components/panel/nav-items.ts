import type { LucideIcon } from "lucide-react";
import { Server, Users, Network, ScrollText, Activity, CreditCard, LifeBuoy, Store } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  requiresAdmin?: boolean;
}

export const CLIENT_NAV: NavItem[] = [
  { label: "Mes serveurs", href: "/servers", icon: Server },
  { label: "Facturation", href: "/billing", icon: CreditCard },
  { label: "Support", href: "/support", icon: LifeBuoy },
  { label: "Marketplace", href: "/marketplace", icon: Store },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Utilisateurs", href: "/admin/users", icon: Users, requiresAdmin: true },
  { label: "Nodes", href: "/admin/nodes", icon: Network, requiresAdmin: true },
  { label: "Monitoring", href: "/admin/monitoring", icon: Activity, requiresAdmin: true },
  { label: "Audit logs", href: "/admin/audit-logs", icon: ScrollText, requiresAdmin: true },
];
