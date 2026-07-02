"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./status-badge";

interface Backup {
  id: string;
  name: string;
  status: string;
  sizeBytes: string | null;
  createdAt: string;
}

export function BackupsPanel({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const backupsQuery = useQuery({
    queryKey: ["backups", serverId],
    queryFn: () => api.get<Backup[]>(`/servers/${serverId}/backups`),
    refetchInterval: 5000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["backups", serverId] });

  const createMutation = useMutation({
    mutationFn: () => api.post(`/servers/${serverId}/backups`, { name: name || undefined }),
    onSuccess: () => {
      toast.success("Sauvegarde lancée");
      setName("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/servers/${serverId}/backups/${id}/restore`),
    onSuccess: () => {
      toast.success("Restauration lancée");
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/servers/${serverId}/backups/${id}`),
    onSuccess: invalidate,
  });

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="flex gap-2"
      >
        <input
          className="flex h-9 w-64 rounded-md border bg-transparent px-3 text-sm"
          placeholder="Nom (optionnel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          <Plus className="mr-1 size-4" /> Nouvelle sauvegarde
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Taille</TableHead>
            <TableHead>Créée le</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {backupsQuery.data?.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.name}</TableCell>
              <TableCell>
                <StatusBadge status={b.status} />
              </TableCell>
              <TableCell>{b.sizeBytes ? `${(Number(b.sizeBytes) / 1024 / 1024).toFixed(1)} Mo` : "-"}</TableCell>
              <TableCell>{new Date(b.createdAt).toLocaleString()}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button size="icon" variant="ghost" onClick={() => restoreMutation.mutate(b.id)}>
                  <RotateCcw className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(b.id)}>
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
