"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ScheduledTask {
  id: string;
  name: string;
  cronExpr: string;
  action: "POWER_START" | "POWER_STOP" | "POWER_RESTART" | "BACKUP_CREATE" | "COMMAND_SEND";
  payload: { command?: string } | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

const ACTION_LABELS: Record<ScheduledTask["action"], string> = {
  POWER_START: "Démarrer",
  POWER_STOP: "Arrêter",
  POWER_RESTART: "Redémarrer",
  BACKUP_CREATE: "Créer une sauvegarde",
  COMMAND_SEND: "Envoyer une commande",
};

export function ScheduledTasksPanel({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [cronExpr, setCronExpr] = useState("0 4 * * *");
  const [action, setAction] = useState<ScheduledTask["action"]>("BACKUP_CREATE");
  const [command, setCommand] = useState("");

  const tasksQuery = useQuery({
    queryKey: ["scheduled-tasks", serverId],
    queryFn: () => api.get<ScheduledTask[]>(`/servers/${serverId}/scheduled-tasks`),
    refetchInterval: 15000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["scheduled-tasks", serverId] });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/servers/${serverId}/scheduled-tasks`, {
        name,
        cronExpr,
        action,
        payload: action === "COMMAND_SEND" ? { command } : undefined,
      }),
    onSuccess: () => {
      toast.success("Tâche planifiée créée");
      setName("");
      setCommand("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const toggleMutation = useMutation({
    mutationFn: (task: ScheduledTask) =>
      api.post(`/servers/${serverId}/scheduled-tasks/${task.id}/${task.enabled ? "disable" : "enable"}`),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/servers/${serverId}/scheduled-tasks/${id}`),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="flex flex-col gap-3 rounded-md border p-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Backup nocturne" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Expression cron</Label>
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              required
              className="font-mono text-sm"
              placeholder="0 4 * * *"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Action</Label>
            <Select value={action} onValueChange={(v) => v && setAction(v as ScheduledTask["action"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_LABELS) as ScheduledTask["action"][]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {action === "COMMAND_SEND" && (
          <div className="flex flex-col gap-1.5">
            <Label>Commande</Label>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
              className="font-mono text-sm"
              placeholder="say Redémarrage dans 5 minutes"
            />
          </div>
        )}
        <div>
          <Button type="submit" size="sm" disabled={createMutation.isPending}>
            <Plus className="mr-1 size-4" /> Ajouter
          </Button>
        </div>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Cron</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Prochaine exécution</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasksQuery.data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                Aucune tâche planifiée.
              </TableCell>
            </TableRow>
          )}
          {tasksQuery.data?.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="font-medium">{task.name}</TableCell>
              <TableCell className="font-mono text-xs">{task.cronExpr}</TableCell>
              <TableCell className="text-sm">
                {ACTION_LABELS[task.action]}
                {task.action === "COMMAND_SEND" && task.payload?.command && (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">({task.payload.command})</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={task.enabled ? "outline" : "secondary"}>{task.enabled ? "Active" : "Désactivée"}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : "-"}
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate(task)}
                  title={task.enabled ? "Désactiver" : "Activer"}
                >
                  {task.enabled ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Supprimer la tâche "${task.name}" ?`)) deleteMutation.mutate(task.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
