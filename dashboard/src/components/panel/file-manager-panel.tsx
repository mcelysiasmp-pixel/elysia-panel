"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  Upload,
  FilePlus,
} from "lucide-react";
import { api, ApiError, getAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9401/api";

interface FileEntry {
  name: string;
  is_directory: boolean;
  size_bytes: string;
  modified_at_ms: string;
  mode: string;
}

function formatSize(bytes: string): string {
  const n = Number(bytes);
  if (!n) return "-";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function FileManagerPanel({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editing, setEditing] = useState<{ path: string; content: string; isNew: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filesQuery = useQuery({
    queryKey: ["files", serverId, path],
    queryFn: () => api.get<FileEntry[]>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["files", serverId, path] });

  const mkdirMutation = useMutation({
    mutationFn: (name: string) => api.post(`/servers/${serverId}/files/mkdir`, { path: joinPath(path, name) }),
    onSuccess: () => {
      toast.success("Dossier créé");
      setNewFolderOpen(false);
      setNewFolderName("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.post(`/servers/${serverId}/files/delete`, { path: joinPath(path, name) }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const renameMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api.post(`/servers/${serverId}/files/rename`, { fromPath: from, toPath: to }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", path);
      return api.upload(`/servers/${serverId}/files/upload`, formData);
    },
    onSuccess: () => {
      toast.success("Fichier envoyé");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur d'envoi"),
  });

  const writeMutation = useMutation({
    mutationFn: ({ filePath, content }: { filePath: string; content: string }) =>
      api.post(`/servers/${serverId}/files`, { path: filePath, content }),
    onSuccess: () => {
      toast.success("Fichier enregistré");
      setEditing(null);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  async function openFile(name: string) {
    const filePath = joinPath(path, name);
    try {
      const res = await fetch(`${API_URL}/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (!res.ok) throw new Error("Lecture impossible (fichier binaire ou trop volumineux ?)");
      const content = await res.text();
      setEditing({ path: filePath, content, isNew: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de lecture");
    }
  }

  async function downloadFile(name: string) {
    const filePath = joinPath(path, name);
    const res = await fetch(`${API_URL}/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) {
      toast.error("Téléchargement impossible");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const breadcrumbs = path ? path.split("/") : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <button className="text-primary hover:underline" onClick={() => setPath("")}>
            /
          </button>
          {breadcrumbs.map((segment, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="text-muted-foreground">/</span>
              <button
                className="text-primary hover:underline"
                onClick={() => setPath(breadcrumbs.slice(0, i + 1).join("/"))}
              >
                {segment}
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1 size-4" /> Envoyer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing({ path: "", content: "", isNew: true })}>
            <FilePlus className="mr-1 size-4" /> Nouveau fichier
          </Button>
          <Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus className="mr-1 size-4" /> Nouveau dossier
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Taille</TableHead>
            <TableHead>Modifié le</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filesQuery.data
            ?.slice()
            .sort((a, b) => Number(b.is_directory) - Number(a.is_directory) || a.name.localeCompare(b.name))
            .map((entry) => (
              <TableRow key={entry.name}>
                <TableCell>
                  <button
                    className="flex items-center gap-2 hover:underline"
                    onClick={() => (entry.is_directory ? setPath(joinPath(path, entry.name)) : openFile(entry.name))}
                  >
                    {entry.is_directory ? (
                      <Folder className="size-4 text-muted-foreground" />
                    ) : (
                      <FileIcon className="size-4 text-muted-foreground" />
                    )}
                    {entry.name}
                  </button>
                </TableCell>
                <TableCell>{entry.is_directory ? "-" : formatSize(entry.size_bytes)}</TableCell>
                <TableCell>{new Date(Number(entry.modified_at_ms)).toLocaleString()}</TableCell>
                <TableCell className="flex justify-end gap-1">
                  {!entry.is_directory && (
                    <Button size="icon" variant="ghost" onClick={() => downloadFile(entry.name)}>
                      <Download className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const next = window.prompt("Nouveau nom", entry.name);
                      if (next && next !== entry.name) {
                        renameMutation.mutate({ from: joinPath(path, entry.name), to: joinPath(path, next) });
                      }
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(`Supprimer "${entry.name}" ?`)) deleteMutation.mutate(entry.name);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          {filesQuery.data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Dossier vide
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau dossier</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolderName) mkdirMutation.mutate(newFolderName);
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label>Nom</Label>
              <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} required autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={mkdirMutation.isPending}>
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.isNew ? "Nouveau fichier" : editing?.path}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-3">
              {editing.isNew && (
                <div className="flex flex-col gap-2">
                  <Label>Chemin</Label>
                  <Input
                    placeholder="ex: config.yml"
                    value={editing.path}
                    onChange={(e) => setEditing({ ...editing, path: e.target.value })}
                    autoFocus
                  />
                </div>
              )}
              <Textarea
                className="min-h-80 font-mono text-xs"
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
              <DialogFooter>
                <Button
                  onClick={() => {
                    const filePath = editing.isNew ? joinPath(path, editing.path) : editing.path;
                    if (!filePath) return;
                    writeMutation.mutate({ filePath, content: editing.content });
                  }}
                  disabled={writeMutation.isPending}
                >
                  Enregistrer
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
