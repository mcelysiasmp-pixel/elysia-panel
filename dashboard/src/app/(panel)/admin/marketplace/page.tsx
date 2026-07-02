"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
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

const ITEM_TYPES = ["PLUGIN", "THEME", "TEMPLATE", "DOCKER_IMAGE", "EXTENSION"];

interface MarketplaceItem {
  id: string;
  type: string;
  name: string;
  slug: string;
  authorName: string;
  priceCents: number;
  version: string;
  verified: boolean;
  downloads: number;
}

const emptyForm = {
  type: "PLUGIN",
  name: "",
  slug: "",
  description: "",
  authorName: "",
  priceCents: 0,
  version: "",
  downloadUrl: "",
  repoUrl: "",
};

export default function AdminMarketplacePage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const itemsQuery = useQuery({
    queryKey: ["admin-marketplace-items"],
    queryFn: () => api.get<MarketplaceItem[]>("/marketplace/items"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-marketplace-items"] });

  const publishMutation = useMutation({
    mutationFn: () =>
      api.post("/marketplace/items", {
        ...form,
        priceCents: Number(form.priceCents),
        downloadUrl: form.downloadUrl || undefined,
        repoUrl: form.repoUrl || undefined,
        description: form.description || undefined,
      }),
    onSuccess: () => {
      toast.success("Item publié");
      setOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.post(`/marketplace/items/${id}/verify`),
    onSuccess: () => {
      toast.success("Item vérifié");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace (admin)</h1>
          <p className="text-sm text-muted-foreground">Publier et vérifier des items du marketplace.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" /> Publier un item
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Publier un item marketplace</DialogTitle>
              <DialogDescription>
                Seuls les items de type PLUGIN gratuits peuvent être installés automatiquement depuis la page
                marketplace ; les autres restent en catalogue.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                publishMutation.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Version</Label>
                  <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Nom</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Slug (identifiant unique dans l&apos;URL)</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Auteur</Label>
                  <Input value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Prix (centimes, 0 = gratuit)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.priceCents}
                    onChange={(e) => setForm({ ...form, priceCents: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>URL de téléchargement</Label>
                <Input
                  value={form.downloadUrl}
                  onChange={(e) => setForm({ ...form, downloadUrl: e.target.value })}
                  placeholder="https://github.com/..."
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>URL du dépôt (optionnel)</Label>
                <Input
                  value={form.repoUrl}
                  onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={publishMutation.isPending}>
                  Publier
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
            <TableHead>Auteur</TableHead>
            <TableHead>Prix</TableHead>
            <TableHead>Téléchargements</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {itemsQuery.data?.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{item.type}</Badge>
              </TableCell>
              <TableCell>{item.authorName}</TableCell>
              <TableCell>{item.priceCents === 0 ? "Gratuit" : `${(item.priceCents / 100).toFixed(2)} EUR`}</TableCell>
              <TableCell>{item.downloads}</TableCell>
              <TableCell>{item.verified && <Badge>Vérifié</Badge>}</TableCell>
              <TableCell className="text-right">
                {!item.verified && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={verifyMutation.isPending}
                    onClick={() => verifyMutation.mutate(item.id)}
                  >
                    <BadgeCheck className="mr-1 size-4" /> Vérifier
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
