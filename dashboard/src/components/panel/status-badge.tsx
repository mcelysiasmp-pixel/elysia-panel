import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  RUNNING: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  ONLINE: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  STARTING: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  STOPPING: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  INSTALLING: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  RESTORING: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  TRANSFERRING: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  OFFLINE: "bg-muted text-muted-foreground",
  MAINTENANCE: "bg-muted text-muted-foreground",
  CRASHED: "bg-destructive/15 text-destructive border-destructive/30",
  INSTALL_FAILED: "bg-destructive/15 text-destructive border-destructive/30",
  SUSPENDED: "bg-destructive/15 text-destructive border-destructive/30",
  DEGRADED: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status] ?? "")}>
      {status.toLowerCase().replace("_", " ")}
    </Badge>
  );
}
