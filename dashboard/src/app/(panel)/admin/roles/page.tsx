"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Permission {
  id: string;
  key: string;
  group: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: Permission }[];
}

export default function AdminRolesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const rolesQuery = useQuery({ queryKey: ["roles-full"], queryFn: () => api.get<Role[]>("/roles") });
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.get<Permission[]>("/roles/permissions"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["roles-full"] });

  const createMutation = useMutation({
    mutationFn: () => api.post("/roles", { name, description: description || undefined }),
    onSuccess: () => {
      toast.success("Rôle créé");
      setOpen(false);
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      toast.success("Rôle supprimé");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissionsQuery.data ?? []) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissionsQuery.data]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rôles</h1>
          <p className="text-sm text-muted-foreground">Rôles et permissions granulaires attribuables aux comptes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" /> Nouveau rôle
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau rôle</DialogTitle>
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
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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

      <div className="flex flex-col gap-4">
        {rolesQuery.data?.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            groups={groups}
            onDelete={() => {
              if (window.confirm(`Supprimer le rôle "${role.name}" ?`)) deleteMutation.mutate(role.id);
            }}
            deleting={deleteMutation.isPending}
            onSaved={invalidate}
          />
        ))}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  groups,
  onDelete,
  deleting,
  onSaved,
}: {
  role: Role;
  groups: [string, Permission[]][];
  onDelete: () => void;
  deleting: boolean;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => role.permissions.map((rp) => rp.permission.key));
  const [dirty, setDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/roles/${role.id}/permissions`, { permissions: selected }),
    onSuccess: () => {
      toast.success(`Permissions de "${role.name}" mises à jour`);
      setDirty(false);
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setDirty(true);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {role.name}
            {role.isSystem && (
              <Badge variant="secondary" className="text-xs">
                Système
              </Badge>
            )}
          </CardTitle>
          {role.description && <CardDescription>{role.description}</CardDescription>}
        </div>
        {!role.isSystem && (
          <Button size="icon" variant="ghost" disabled={deleting} onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {role.name === "admin" && role.isSystem ? (
          <p className="text-sm text-muted-foreground">
            Ce rôle a un accès total (wildcard) codé en dur — les permissions ci-dessous ne s&apos;appliquent pas à lui.
          </p>
        ) : null}
        {groups.map(([group, perms]) => (
          <div key={group} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase text-muted-foreground">{group}</span>
            <div className="flex flex-wrap gap-3">
              {perms.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.key)}
                    onChange={() => toggle(p.key)}
                    className="size-4 rounded border"
                  />
                  {p.key}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div>
          <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="mr-1 size-4" /> Enregistrer les permissions
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
