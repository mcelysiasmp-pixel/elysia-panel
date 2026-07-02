"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ServerListItem } from "@/lib/types";
import { StatusBadge } from "@/components/panel/status-badge";
import { PowerActions } from "@/components/panel/power-actions";
import { ServerConsole } from "@/components/panel/server-console";
import { BackupsPanel } from "@/components/panel/backups-panel";
import { ModsPanel } from "@/components/panel/mods-panel";
import { SftpPanel } from "@/components/panel/sftp-panel";
import { FileManagerPanel } from "@/components/panel/file-manager-panel";
import { StatsPanel } from "@/components/panel/stats-panel";
import { SettingsPanel } from "@/components/panel/settings-panel";
import { ScheduledTasksPanel } from "@/components/panel/scheduled-tasks-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const serverQuery = useQuery({
    queryKey: ["server", id],
    queryFn: () => api.get<ServerListItem>(`/servers/${id}`),
    refetchInterval: 10000,
  });

  const server = serverQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{server?.name ?? "..."}</h1>
            {server && <StatusBadge status={server.suspended ? "SUSPENDED" : server.status} />}
          </div>
          {server && (
            <p className="text-sm text-muted-foreground">
              {server.template.name} · Node {server.node.name}
              {server.allocations[0] && ` · ${server.allocations[0].ip}:${server.allocations[0].port}`}
            </p>
          )}
        </div>
        <PowerActions serverId={id} />
      </div>

      {server && <StatsPanel serverId={id} cpuLimitPct={server.cpuLimitPct} memoryLimitMb={server.memoryLimitMb} />}

      <Tabs defaultValue="console">
        <TabsList>
          <TabsTrigger value="console">Console</TabsTrigger>
          <TabsTrigger value="files">Fichiers</TabsTrigger>
          <TabsTrigger value="backups">Sauvegardes</TabsTrigger>
          <TabsTrigger value="mods">Mods / Plugins</TabsTrigger>
          <TabsTrigger value="sftp">SFTP</TabsTrigger>
          <TabsTrigger value="schedules">Tâches planifiées</TabsTrigger>
          <TabsTrigger value="settings">Paramètres</TabsTrigger>
        </TabsList>
        <TabsContent value="console" className="pt-4">
          <ServerConsole serverId={id} />
        </TabsContent>
        <TabsContent value="files" className="pt-4">
          <FileManagerPanel serverId={id} />
        </TabsContent>
        <TabsContent value="backups" className="pt-4">
          <BackupsPanel serverId={id} />
        </TabsContent>
        <TabsContent value="mods" className="pt-4">
          <ModsPanel serverId={id} />
        </TabsContent>
        <TabsContent value="sftp" className="pt-4">
          {server && <SftpPanel server={server} />}
        </TabsContent>
        <TabsContent value="schedules" className="pt-4">
          <ScheduledTasksPanel serverId={id} />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          {server && <SettingsPanel server={server} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
