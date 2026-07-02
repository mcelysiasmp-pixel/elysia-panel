"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLogItem } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SEVERITY_VARIANT: Record<string, "outline" | "secondary" | "destructive"> = {
  INFO: "outline",
  WARNING: "secondary",
  CRITICAL: "destructive",
};

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const logsQuery = useInfiniteQuery({
    queryKey: ["audit-logs"],
    queryFn: ({ pageParam }) => api.get<AuditLogItem[]>(`/audit-logs?skip=${pageParam}&take=${PAGE_SIZE}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });

  const items = logsQuery.data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
        <p className="text-sm text-muted-foreground">Historique des actions sensibles effectuées sur le panel.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Acteur</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Cible</TableHead>
              <TableHead>Sévérité</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs">{new Date(log.createdAt).toLocaleString()}</TableCell>
                <TableCell>{log.actor?.username ?? "système"}</TableCell>
                <TableCell className="font-mono text-xs">{log.action}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {log.targetType} {log.targetId?.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <Badge variant={SEVERITY_VARIANT[log.severity]}>{log.severity}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{log.ip}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {logsQuery.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={logsQuery.isFetchingNextPage}
            onClick={() => logsQuery.fetchNextPage()}
          >
            {logsQuery.isFetchingNextPage ? "Chargement..." : "Charger plus"}
          </Button>
        )}
      </div>
    </div>
  );
}
