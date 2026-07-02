"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLogItem } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const SEVERITY_VARIANT: Record<string, "outline" | "secondary" | "destructive"> = {
  INFO: "outline",
  WARNING: "secondary",
  CRITICAL: "destructive",
};

export default function AuditLogsPage() {
  const logsQuery = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.get<AuditLogItem[]>("/audit-logs?take=100"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
        <p className="text-sm text-muted-foreground">Historique des actions sensibles effectuées sur le panel.</p>
      </div>

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
          {logsQuery.data?.map((log) => (
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
    </div>
  );
}
