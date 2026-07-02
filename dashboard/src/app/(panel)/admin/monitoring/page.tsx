"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { MonitoringSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        <StatCard title="Nodes en ligne" value={s ? `${s.nodes.online}/${s.nodes.total}` : "-"} />
        <StatCard
          title="CPU alloué"
          value={s ? `${s.nodes.cpuAllocatedPct}/${s.nodes.cpuCapacityPct}%` : "-"}
        />
        <StatCard
          title="RAM allouée"
          value={s ? `${(s.nodes.memoryAllocatedMb / 1024).toFixed(1)}/${(s.nodes.memoryCapacityMb / 1024).toFixed(1)} Go` : "-"}
        />
        <StatCard title="Utilisateurs" value={s ? String(s.users) : "-"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Serveurs par statut</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {s &&
            Object.entries(s.servers).map(([status, count]) => (
              <div key={status} className="flex flex-col items-center rounded-md border px-4 py-2">
                <span className="text-2xl font-semibold">{count}</span>
                <span className="text-xs text-muted-foreground">{status}</span>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <span className="text-2xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}
