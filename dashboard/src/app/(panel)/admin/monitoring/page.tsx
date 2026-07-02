"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { MonitoringSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Même mapping sémantique que status-badge.tsx (bg-*-500), traduit en
// couleur de remplissage de barre pour rester cohérent visuellement entre
// badges et graphes sur cette page.
const STATUS_BAR_COLOR: Record<string, string> = {
  RUNNING: "#10b981",
  STARTING: "#f59e0b",
  STOPPING: "#f59e0b",
  INSTALLING: "#3b82f6",
  RESTORING: "#3b82f6",
  TRANSFERRING: "#3b82f6",
  OFFLINE: "var(--muted-foreground)",
  CRASHED: "var(--destructive)",
  INSTALL_FAILED: "var(--destructive)",
  SUSPENDED: "var(--destructive)",
};

function meterColor(pct: number): string {
  if (pct >= 90) return "var(--status-critical)";
  if (pct >= 70) return "var(--status-warning)";
  return "var(--status-good)";
}

function CapacityMeter({
  label,
  used,
  total,
  unit,
  format,
}: {
  label: string;
  used: number;
  total: number;
  unit: string;
  format?: (v: number) => string;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const fmt = format ?? ((v: number) => v.toLocaleString());

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight">{pct.toFixed(0)}%</span>
          <span className="text-xs text-muted-foreground">
            {fmt(used)} / {fmt(total)} {unit}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${pct}%`, backgroundColor: meterColor(pct) }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ServersByStatusChart({ servers }: { servers: Record<string, number> }) {
  const entries = Object.entries(servers)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count), 1);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun serveur pour le moment.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([status, count]) => (
        <div key={status} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs text-muted-foreground capitalize">
            {status.toLowerCase().replace("_", " ")}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted">
            <div
              className="h-full rounded-sm"
              style={{
                width: `${(count / max) * 100}%`,
                backgroundColor: STATUS_BAR_COLOR[status] ?? "var(--muted-foreground)",
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  );
}

export default function MonitoringPage() {
  const summaryQuery = useQuery({
    queryKey: ["monitoring-summary"],
    queryFn: () => api.get<MonitoringSummary>("/monitoring/summary"),
    refetchInterval: 15000,
  });

  const s = summaryQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
        <p className="text-sm text-muted-foreground">Vue d&apos;ensemble de l&apos;infrastructure Elysia.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Nodes en ligne</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{s ? `${s.nodes.online}/${s.nodes.total}` : "-"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Utilisateurs</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{s ? s.users.toLocaleString() : "-"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Factures impayées</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">{s ? s.invoicesUnpaid.toLocaleString() : "-"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">Serveurs</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold">
              {s ? Object.values(s.servers).reduce((a, b) => a + b, 0) : "-"}
            </span>
          </CardContent>
        </Card>
      </div>

      {s && (
        <div className="grid gap-4 sm:grid-cols-3">
          <CapacityMeter label="CPU alloué" used={s.nodes.cpuAllocatedPct} total={s.nodes.cpuCapacityPct} unit="%" />
          <CapacityMeter
            label="RAM allouée"
            used={s.nodes.memoryAllocatedMb / 1024}
            total={s.nodes.memoryCapacityMb / 1024}
            unit="Go"
            format={(v) => v.toFixed(1)}
          />
          <CapacityMeter
            label="Disque alloué"
            used={s.nodes.diskAllocatedMb / 1024}
            total={s.nodes.diskCapacityMb / 1024}
            unit="Go"
            format={(v) => v.toFixed(1)}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Serveurs par statut</CardTitle>
        </CardHeader>
        <CardContent>{s && <ServersByStatusChart servers={s.servers} />}</CardContent>
      </Card>
    </div>
  );
}
