"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, PauseCircle, PlayCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { UserItem } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminUsersPage() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<UserItem[]>("/users") });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });

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
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => {
      toast.success("Utilisateur réactivé");
      invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">Gestion des comptes, suspension, bannissement.</p>
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
                <Badge variant="secondary">{u.role?.name ?? "-"}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={u.status === "ACTIVE" ? "outline" : "destructive"}>{u.status}</Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                {u.status === "ACTIVE" ? (
                  <Button size="icon" variant="ghost" onClick={() => suspend.mutate(u.id)}>
                    <PauseCircle className="size-4" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" onClick={() => reactivate.mutate(u.id)}>
                    <PlayCircle className="size-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => ban.mutate(u.id)}>
                  <Ban className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
