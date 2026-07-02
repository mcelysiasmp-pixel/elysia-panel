"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, KeyRound, PauseCircle, PlayCircle, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { UserItem } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface RoleOption {
  id: string;
  name: string;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<UserItem[]>("/users") });
  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleOption[]>("/roles") });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const setRole = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) => api.patch(`/users/${id}`, { roleId }),
    onSuccess: () => {
      toast.success("Rôle mis à jour");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/suspend`, { reason: "Suspendu depuis le panel admin" }),
    onSuccess: () => {
      toast.success("Utilisateur suspendu");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const ban = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/ban`, { reason: "Banni depuis le panel admin" }),
    onSuccess: () => {
      toast.success("Utilisateur banni");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => {
      toast.success("Utilisateur réactivé");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/users", { email, username, password, roleId: roleId || undefined }),
    onSuccess: () => {
      toast.success("Utilisateur créé");
      setCreateOpen(false);
      setEmail("");
      setUsername("");
      setPassword("");
      setRoleId("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur lors de la création"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success("Utilisateur supprimé");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.post(`/users/${resetTarget!.id}/reset-password`, { newPassword }),
    onSuccess: () => {
      toast.success(`Mot de passe de ${resetTarget!.username} réinitialisé`);
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">Gestion des comptes, suspension, bannissement.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" /> Nouvel utilisateur
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel utilisateur</DialogTitle>
              <DialogDescription>Crée un compte manuellement (sans passer par l&apos;inscription publique).</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Nom d&apos;utilisateur</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Mot de passe</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={10}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Rôle</Label>
                <Select value={roleId} onValueChange={(v) => setRoleId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Par défaut" />
                  </SelectTrigger>
                  <SelectContent>
                    {rolesQuery.data?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <TableHead>Utilisateur</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usersQuery.data?.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.username}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Select
                  value={u.role?.id ?? ""}
                  onValueChange={(v) => v && setRole.mutate({ id: u.id, roleId: v })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent>
                    {rolesQuery.data?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Badge variant={u.status === "ACTIVE" ? "outline" : "destructive"}>{u.status}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {u.status === "ACTIVE" ? (
                  <Button size="icon" variant="ghost" title="Suspendre" onClick={() => suspend.mutate(u.id)}>
                    <PauseCircle className="size-4" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" title="Réactiver" onClick={() => reactivate.mutate(u.id)}>
                    <PlayCircle className="size-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  title="Réinitialiser le mot de passe"
                  onClick={() => {
                    setResetTarget(u);
                    setNewPassword("");
                  }}
                >
                  <KeyRound className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Bannir" onClick={() => ban.mutate(u.id)}>
                  <Ban className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Supprimer"
                  onClick={() => {
                    if (window.confirm(`Supprimer définitivement le compte "${u.username}" ?`)) {
                      deleteMutation.mutate(u.id);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={resetTarget !== null} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe de {resetTarget?.username}</DialogTitle>
            <DialogDescription>Toutes ses sessions actives seront révoquées.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              resetPasswordMutation.mutate();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-2">
              <Label>Nouveau mot de passe</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={10}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                Réinitialiser
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
