"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Plus, Wrench } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { NodeItem } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/panel/status-badge";

const emptyForm = {
  name: "",
  fqdn: "",
  grpcHost: "",
  grpcPort: 9501,
  cpuCores: 4,
  memoryMb: 8192,
  diskMb: 102400,
  dockerNetworkSubnet: "172.30.1.0/24",
};

export default function AdminNodesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const nodesQuery = useQuery({ queryKey: ["admin-nodes"], queryFn: () => api.get<NodeItem[]>("/nodes") });

  const createMutation = useMutation({
    mutationFn: () => api.post("/nodes", form),
    onSuccess: () => {
      toast.success("Node créé");
      setOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["admin-nodes"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const healthMutation = useMutation({
    mutationFn: (id: string) => api.get<{ online: boolean }>(`/nodes/${id}/health`),
    onSuccess: (res) => toast[res.online ? "success" : "error"](res.online ? "Node en ligne" : "Node injoignable"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nodes</h1>
          <p className="text-sm text-muted-foreground">Serveurs physiques exécutant Elysia Node.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" /> Ajouter un node
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau node</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="grid grid-cols-2 gap-3"
            >
              <Field label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="FQDN" value={form.fqdn} onChange={(v) => setForm({ ...form, fqdn: v })} />
              <Field label="gRPC host" value={form.grpcHost} onChange={(v) => setForm({ ...form, grpcHost: v })} />
              <Field
                label="gRPC port"
                type="number"
                value={form.grpcPort}
                onChange={(v) => setForm({ ...form, grpcPort: Number(v) })}
              />
              <Field
                label="CPU cores"
                type="number"
                value={form.cpuCores}
                onChange={(v) => setForm({ ...form, cpuCores: Number(v) })}
              />
              <Field
                label="RAM (Mo)"
                type="number"
                value={form.memoryMb}
                onChange={(v) => setForm({ ...form, memoryMb: Number(v) })}
              />
              <Field
                label="Disque (Mo)"
                type="number"
                value={form.diskMb}
                onChange={(v) => setForm({ ...form, diskMb: Number(v) })}
              />
              <Field
                label="Subnet Docker"
                value={form.dockerNetworkSubnet}
                onChange={(v) => setForm({ ...form, dockerNetworkSubnet: v })}
              />
              <DialogFooter className="col-span-2">
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
            <TableHead>FQDN</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Capacité (CPU/RAM/Disque)</TableHead>
            <TableHead>Serveurs</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodesQuery.data?.map((n) => (
            <TableRow key={n.id}>
              <TableCell className="font-medium">{n.name}</TableCell>
              <TableCell>{n.fqdn}</TableCell>
              <TableCell>
                <StatusBadge status={n.maintenanceMode ? "MAINTENANCE" : n.status} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {n.cpuAllocatedPct}/{n.cpuCores * 100}% · {n.memoryAllocatedMb}/{n.memoryMb} Mo · {n.diskAllocatedMb}/
                {n.diskMb} Mo
              </TableCell>
              <TableCell>{n._count?.servers ?? 0}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button size="icon" variant="ghost" onClick={() => healthMutation.mutate(n.id)}>
                  <Activity className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    api
                      .post(`/nodes/${n.id}/maintenance/${n.maintenanceMode ? "disable" : "enable"}`)
                      .then(() => queryClient.invalidateQueries({ queryKey: ["admin-nodes"] }))
                  }
                >
                  <Wrench className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} required />
    </div>
  );
}
