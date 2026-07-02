"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, Download } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { ServerListItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MarketplaceItem {
  id: string;
  type: string;
  name: string;
  slug: string;
  description: string | null;
  authorName: string;
  priceCents: number;
  verified: boolean;
  downloads: number;
}

export default function MarketplacePage() {
  const queryClient = useQueryClient();
  const [installing, setInstalling] = useState<MarketplaceItem | null>(null);
  const [serverId, setServerId] = useState("");
  const [targetDir, setTargetDir] = useState("plugins");

  const itemsQuery = useQuery({
    queryKey: ["marketplace-items"],
    queryFn: () => api.get<MarketplaceItem[]>("/marketplace/items"),
  });

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<ServerListItem[]>("/servers"),
    enabled: installing !== null,
  });

  const installMutation = useMutation({
    mutationFn: () =>
      api.post(`/servers/${serverId}/mods/marketplace`, { slug: installing!.slug, targetDir: targetDir || "plugins" }),
    onSuccess: () => {
      toast.success(`${installing!.name} installé`);
      queryClient.invalidateQueries({ queryKey: ["marketplace-items"] });
      setInstalling(null);
      setServerId("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur lors de l'installation"),
  });

  function openInstall(item: MarketplaceItem) {
    setInstalling(item);
    setServerId("");
    setTargetDir("plugins");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
        <p className="text-sm text-muted-foreground">Plugins panel, thèmes, templates et images Docker de la communauté.</p>
      </div>

      {itemsQuery.data?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Store className="size-8" />
            <p>Le marketplace est vide pour le moment.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {itemsQuery.data?.map((item) => {
          const canInstall = item.type === "PLUGIN" && item.priceCents === 0;
          return (
            <Card key={item.id}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <CardTitle className="text-base">{item.name}</CardTitle>
                {item.verified && <Badge>Vérifié</Badge>}
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                <p className="line-clamp-2">{item.description}</p>
                <span>Par {item.authorName}</span>
                <div className="flex items-center justify-between pt-1">
                  <Badge variant="outline">{item.type}</Badge>
                  <span>{item.priceCents === 0 ? "Gratuit" : `${(item.priceCents / 100).toFixed(2)} EUR`}</span>
                </div>
                {canInstall && (
                  <Button size="sm" className="mt-2" onClick={() => openInstall(item)}>
                    <Download className="mr-1 size-4" /> Installer
                  </Button>
                )}
                {item.type === "PLUGIN" && item.priceCents > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Achat requis — paiement bientôt disponible</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={installing !== null} onOpenChange={(open) => !open && setInstalling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Installer {installing?.name}</DialogTitle>
            <DialogDescription>Choisissez le serveur cible et le dossier d&apos;installation.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              installMutation.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label>Serveur</Label>
              <Select value={serverId} onValueChange={(v) => setServerId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un serveur" />
                </SelectTrigger>
                <SelectContent>
                  {serversQuery.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Dossier cible</Label>
              <Input value={targetDir} onChange={(e) => setTargetDir(e.target.value)} placeholder="plugins" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={installMutation.isPending || !serverId}>
                {installMutation.isPending ? "Installation..." : "Installer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
