"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { ServerTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const GAME_TYPES = [
  "MINECRAFT_JAVA",
  "MINECRAFT_BEDROCK",
  "DISCORD_BOT",
  "GENERIC_DOCKER",
  "WEB_HOSTING",
  "VPS",
  "FIVEM",
  "RUST",
  "TERRARIA",
  "ARK",
];

const emptyForm = {
  name: "",
  gameType: "GENERIC_DOCKER",
  description: "",
  dockerImage: "",
  startupCommand: "",
  stopCommand: "stop",
  minMemoryMb: 1024,
};

export default function AdminTemplatesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const templatesQuery = useQuery({
    queryKey: ["admin-templates"],
    queryFn: () => api.get<ServerTemplate[]>("/server-templates"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/server-templates", {
        ...form,
        description: form.description || undefined,
        minMemoryMb: Number(form.minMemoryMb),
      }),
    onSuccess: () => {
      toast.success("Template créé");
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates de serveur</h1>
          <p className="text-sm text-muted-foreground">Images Docker et commandes de démarrage proposées à la création.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" /> Nouveau template
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouveau template</DialogTitle>
              <DialogDescription>
                Utilisez <code className="font-mono text-xs">{"{{VARIABLE}}"}</code> dans la commande de démarrage pour un
                paramètre à définir par variable d&apos;environnement.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Nom</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Type de jeu</Label>
                  <Select value={form.gameType} onValueChange={(v) => v && setForm({ ...form, gameType: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAME_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Image Docker</Label>
                <Input
                  value={form.dockerImage}
                  onChange={(e) => setForm({ ...form, dockerImage: e.target.value })}
                  placeholder="itzg/minecraft-server:latest"
                  className="font-mono text-sm"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Commande de démarrage</Label>
                <Input
                  value={form.startupCommand}
                  onChange={(e) => setForm({ ...form, startupCommand: e.target.value })}
                  className="font-mono text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Commande d&apos;arrêt</Label>
                  <Input
                    value={form.stopCommand}
                    onChange={(e) => setForm({ ...form, stopCommand: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>RAM minimum (Mo)</Label>
                  <Input
                    type="number"
                    min={128}
                    value={form.minMemoryMb}
                    onChange={(e) => setForm({ ...form, minMemoryMb: Number(e.target.value) })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Image Docker</TableHead>
            <TableHead>RAM min.</TableHead>
            <TableHead>Visibilité</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templatesQuery.data?.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{t.gameType}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{t.dockerImage}</TableCell>
              <TableCell>{t.minMemoryMb} Mo</TableCell>
              <TableCell>
                <Badge variant="secondary">Public</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
