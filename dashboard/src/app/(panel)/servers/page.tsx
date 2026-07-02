"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Server as ServerIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { ServerListItem, ServerTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/panel/status-badge";

export default function ServersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [memoryLimitMb, setMemoryLimitMb] = useState(2048);
  const [diskLimitMb, setDiskLimitMb] = useState(5120);
  const [cpuLimitPct, setCpuLimitPct] = useState(150);

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<ServerListItem[]>("/servers"),
  });

  const templatesQuery = useQuery({
    queryKey: ["server-templates"],
    queryFn: () => api.get<ServerTemplate[]>("/server-templates"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<ServerListItem>("/servers", { name, templateId, memoryLimitMb, diskLimitMb, cpuLimitPct }),
    onSuccess: () => {
      toast.success("Serveur en cours de création");
      setOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur lors de la création"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes serveurs</h1>
          <p className="text-sm text-muted-foreground">Gérez vos serveurs de jeu, bots et applications.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" />
            Nouveau serveur
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un serveur</DialogTitle>
              <DialogDescription>Choisissez un template et vos limites de ressources.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label>Nom</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesQuery.data?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>CPU (%)</Label>
                  <Input
                    type="number"
                    min={10}
                    value={cpuLimitPct}
                    onChange={(e) => setCpuLimitPct(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>RAM (Mo)</Label>
                  <Input
                    type="number"
                    min={256}
                    value={memoryLimitMb}
                    onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Disque (Mo)</Label>
                  <Input
                    type="number"
                    min={512}
                    value={diskLimitMb}
                    onChange={(e) => setDiskLimitMb(Number(e.target.value))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || !templateId}>
                  {createMutation.isPending ? "Création..." : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {serversQuery.isLoading && <p className="text-sm text-muted-foreground">Chargement...</p>}

      {serversQuery.data?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ServerIcon className="size-8" />
            <p>Aucun serveur pour le moment.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {serversQuery.data?.map((server) => (
          <Link key={server.id} href={`/servers/${server.id}`}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-base">{server.name}</CardTitle>
                <StatusBadge status={server.suspended ? "SUSPENDED" : server.status} />
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>{server.template.name}</span>
                <span>
                  {server.cpuLimitPct}% CPU · {server.memoryLimitMb} Mo RAM · {server.diskLimitMb} Mo disque
                </span>
                <span>Node: {server.node.name}</span>
                {server.allocations[0] && (
                  <span>
                    {server.allocations[0].ip}:{server.allocations[0].port}
                  </span>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
