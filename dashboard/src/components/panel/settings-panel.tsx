"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { ServerListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SUBUSER_PERMISSIONS = ["files.read", "files.write", "console.read", "console.send", "backups.create"];

function environmentToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function textToEnvironment(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    env[key.trim()] = rest.join("=").trim();
  }
  return env;
}

export function SettingsPanel({ server }: { server: ServerListItem }) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["server", server.id] });

  return (
    <div className="flex flex-col gap-6">
      <GeneralSettings server={server} onSaved={invalidate} />
      <ReinstallSettings server={server} />
      <AllocationsSettings server={server} onChanged={invalidate} />
      <SubUsersSettings server={server} onChanged={invalidate} />
    </div>
  );
}

function GeneralSettings({ server, onSaved }: { server: ServerListItem; onSaved: () => void }) {
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [dockerImage, setDockerImage] = useState(server.dockerImage);
  const [startupCommand, setStartupCommand] = useState(server.startupCommand);
  const [environmentText, setEnvironmentText] = useState(environmentToText(server.environment ?? {}));

  const updateMutation = useMutation({
    mutationFn: () =>
      api.patch(`/servers/${server.id}`, {
        name,
        description: description || undefined,
        dockerImage,
        startupCommand,
        environment: textToEnvironment(environmentText),
      }),
    onSuccess: () => {
      toast.success("Serveur mis à jour");
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Général</CardTitle>
        <CardDescription>
          Nom, image Docker, commande de démarrage et variables d&apos;environnement. Un redémarrage simple ne relit pas
          ces valeurs — utilisez « Réinstaller » ci-dessous pour les appliquer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-name">Nom</Label>
              <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settings-image">Image Docker</Label>
              <Input id="settings-image" value={dockerImage} onChange={(e) => setDockerImage(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-description">Description</Label>
            <Input id="settings-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-startup">Commande de démarrage</Label>
            <Input
              id="settings-startup"
              value={startupCommand}
              onChange={(e) => setStartupCommand(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-env">Variables d&apos;environnement (une par ligne, CLE=valeur)</Label>
            <Textarea
              id="settings-env"
              value={environmentText}
              onChange={(e) => setEnvironmentText(e.target.value)}
              className="min-h-32 font-mono text-sm"
            />
          </div>

          <div>
            <Button type="submit" disabled={updateMutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ReinstallSettings({ server }: { server: ServerListItem }) {
  const reinstallMutation = useMutation({
    mutationFn: () => api.post(`/servers/${server.id}/reinstall`),
    onSuccess: () => toast.success("Réinstallation lancée"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Réinstaller</CardTitle>
        <CardDescription>
          Recrée le conteneur avec la configuration actuelle (image, commande de démarrage, variables). Nécessaire
          après une modification ci-dessus pour qu&apos;elle prenne effet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          disabled={reinstallMutation.isPending}
          onClick={() => {
            if (window.confirm(`Réinstaller "${server.name}" ? Le conteneur actuel sera recréé.`)) {
              reinstallMutation.mutate();
            }
          }}
        >
          <RefreshCw className="mr-1 size-4" /> Réinstaller le serveur
        </Button>
      </CardContent>
    </Card>
  );
}

function AllocationsSettings({ server, onChanged }: { server: ServerListItem; onChanged: () => void }) {
  const addMutation = useMutation({
    mutationFn: () => api.post(`/servers/${server.id}/allocations`),
    onSuccess: () => {
      toast.success("Allocation ajoutée");
      onChanged();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const removeMutation = useMutation({
    mutationFn: (allocationId: string) => api.delete(`/servers/${server.id}/allocations/${allocationId}`),
    onSuccess: () => {
      toast.success("Allocation supprimée");
      onChanged();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocations réseau</CardTitle>
        <CardDescription>Ports attribués à ce serveur sur son node.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adresse</TableHead>
              <TableHead>Port</TableHead>
              <TableHead></TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {server.allocations.map((alloc) => (
              <TableRow key={alloc.id}>
                <TableCell>{alloc.ip}</TableCell>
                <TableCell>{alloc.port}</TableCell>
                <TableCell>{alloc.isPrimary && <Badge variant="secondary">Primaire</Badge>}</TableCell>
                <TableCell className="text-right">
                  {!alloc.isPrimary && (
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(alloc.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div>
          <Button size="sm" variant="outline" disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
            <Plus className="mr-1 size-4" /> Ajouter une allocation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SubUsersSettings({ server, onChanged }: { server: ServerListItem; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["files.read", "console.read"]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const user = await api.get<{ id: string; username: string; email: string }>(
        `/users/lookup?email=${encodeURIComponent(email)}`,
      );
      return api.post(`/servers/${server.id}/subusers`, { userId: user.id, permissions });
    },
    onSuccess: () => {
      toast.success("Sous-utilisateur ajouté");
      setEmail("");
      onChanged();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/servers/${server.id}/subusers/${userId}`),
    onSuccess: () => {
      toast.success("Sous-utilisateur retiré");
      onChanged();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  function togglePermission(perm: string) {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sous-utilisateurs</CardTitle>
        <CardDescription>Donnez à d&apos;autres comptes un accès limité à ce serveur.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {server.subUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                  Aucun sous-utilisateur.
                </TableCell>
              </TableRow>
            )}
            {server.subUsers.map((su) => (
              <TableRow key={su.id}>
                <TableCell>
                  <div className="text-sm font-medium">{su.user.username}</div>
                  <div className="text-xs text-muted-foreground">{su.user.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {su.permissions.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(su.userId)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
          className="flex flex-col gap-3 rounded-md border p-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subuser-email">Email de l&apos;utilisateur</Label>
            <Input
              id="subuser-email"
              type="email"
              required
              placeholder="ami@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Permissions</Label>
            <div className="flex flex-wrap gap-3">
              {SUBUSER_PERMISSIONS.map((perm) => (
                <label key={perm} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm)}
                    onChange={() => togglePermission(perm)}
                    className="size-4 rounded border"
                  />
                  {perm}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button type="submit" size="sm" disabled={addMutation.isPending}>
              <Plus className="mr-1 size-4" /> Ajouter
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
