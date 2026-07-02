"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, RotateCw, Square, Skull } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function PowerActions({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();

  const action = useMutation({
    mutationFn: (act: "start" | "stop" | "restart" | "kill") => api.post(`/servers/${serverId}/power/${act}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Action impossible"),
  });

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => action.mutate("start")} disabled={action.isPending}>
        <Play className="mr-1 size-4" /> Démarrer
      </Button>
      <Button size="sm" variant="outline" onClick={() => action.mutate("restart")} disabled={action.isPending}>
        <RotateCw className="mr-1 size-4" /> Redémarrer
      </Button>
      <Button size="sm" variant="outline" onClick={() => action.mutate("stop")} disabled={action.isPending}>
        <Square className="mr-1 size-4" /> Arrêter
      </Button>
      <Button size="sm" variant="destructive" onClick={() => action.mutate("kill")} disabled={action.isPending}>
        <Skull className="mr-1 size-4" /> Kill
      </Button>
    </div>
  );
}
