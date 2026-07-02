"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface ModrinthHit {
  project_id: string;
  title: string;
  description: string;
  icon_url: string;
  downloads: number;
}

interface InstalledMod {
  id: string;
  name: string;
  source: string;
  fileName: string;
  installedAt: string;
}

export function ModsPanel({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");

  const installedQuery = useQuery({
    queryKey: ["mods", serverId],
    queryFn: () => api.get<InstalledMod[]>(`/servers/${serverId}/mods`),
  });

  const searchQuery = useQuery({
    queryKey: ["modrinth-search", search],
    queryFn: () => api.get<{ hits: ModrinthHit[] }>(`/mods/modrinth/search?query=${encodeURIComponent(search)}`),
    enabled: search.length > 0,
  });

  const installMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const versions = await api.get<{ id: string }[]>(`/mods/modrinth/${projectId}/versions`);
      if (!versions[0]) throw new Error("Aucune version disponible");
      return api.post(`/servers/${serverId}/mods/modrinth`, { versionId: versions[0].id, targetDir: "mods" });
    },
    onSuccess: () => {
      toast.success("Mod installé");
      queryClient.invalidateQueries({ queryKey: ["mods", serverId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Installation impossible"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/servers/${serverId}/mods/${id}?targetDir=mods`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mods", serverId] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Mods installés</h3>
        <div className="flex flex-col gap-2">
          {installedQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">Aucun mod installé.</p>}
          {installedQuery.data?.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.source} · {m.fileName}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeMutation.mutate(m.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Rechercher sur Modrinth</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
          className="flex gap-2"
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un plugin/mod..." />
          <Button type="submit" size="icon">
            <Search className="size-4" />
          </Button>
        </form>
        <div className="flex flex-col gap-2">
          {searchQuery.data?.hits.map((hit) => (
            <Card key={hit.project_id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{hit.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{hit.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => installMutation.mutate(hit.project_id)}
                  disabled={installMutation.isPending}
                >
                  <Download className="mr-1 size-4" /> Installer
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
