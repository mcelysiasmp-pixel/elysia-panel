"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Plus, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AccountPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>
        <p className="text-sm text-muted-foreground">
          {user?.username} · {user?.email}
        </p>
      </div>

      <ChangePasswordCard />
      <TwoFactorCard />
      <ApiKeysCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post("/auth/change-password", { currentPassword, newPassword }),
    onSuccess: () => {
      toast.success("Mot de passe changé — reconnectez-vous sur vos autres sessions");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe</CardTitle>
        <CardDescription>Changer votre mot de passe révoque vos autres sessions actives.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newPassword !== confirmPassword) {
              toast.error("Les nouveaux mots de passe ne correspondent pas");
              return;
            }
            mutation.mutate();
          }}
          className="flex flex-col gap-4 max-w-sm"
        >
          <div className="flex flex-col gap-1.5">
            <Label>Mot de passe actuel</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={10}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Confirmer le nouveau mot de passe</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={10}
              required
            />
          </div>
          <div>
            <Button type="submit" disabled={mutation.isPending}>
              <KeyRound className="mr-1 size-4" /> Changer le mot de passe
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [disabling, setDisabling] = useState(false);

  const generateMutation = useMutation({
    mutationFn: () => api.post<{ secret: string; qrCodeDataUrl: string }>("/auth/2fa/generate"),
    onSuccess: (data) => setSetup(data),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const enableMutation = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>("/auth/2fa/enable", { code: enableCode }),
    onSuccess: (data) => {
      toast.success("2FA activée");
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setEnableCode("");
      refreshUser();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Code invalide"),
  });

  const disableMutation = useMutation({
    mutationFn: () => api.post("/auth/2fa/disable", { code: disableCode }),
    onSuccess: () => {
      toast.success("2FA désactivée");
      setDisabling(false);
      setDisableCode("");
      refreshUser();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Code invalide"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Authentification à deux facteurs
          {user?.twoFactorEnabled ? (
            <Badge variant="outline" className="text-emerald-500">
              Activée
            </Badge>
          ) : (
            <Badge variant="secondary">Désactivée</Badge>
          )}
        </CardTitle>
        <CardDescription>Protège votre compte avec une app TOTP (Google Authenticator, Aegis...).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recoveryCodes && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-sm font-medium">Codes de récupération — notez-les, ils ne seront plus affichés</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setRecoveryCodes(null)}>
              J&apos;ai noté mes codes
            </Button>
          </div>
        )}

        {!user?.twoFactorEnabled && !setup && !recoveryCodes && (
          <Button
            variant="outline"
            className="w-fit"
            disabled={generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            <ShieldCheck className="mr-1 size-4" /> Activer la 2FA
          </Button>
        )}

        {setup && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enableMutation.mutate();
            }}
            className="flex flex-col gap-3 max-w-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL générée côté backend, pas une image statique du projet */}
            <img src={setup.qrCodeDataUrl} alt="QR code 2FA" className="size-40 rounded-md border" />
            <p className="text-xs text-muted-foreground">
              Scannez ce QR code avec votre app d&apos;authentification, ou saisissez la clé manuellement :{" "}
              <span className="font-mono">{setup.secret}</span>
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Code à 6 chiffres</Label>
              <Input
                value={enableCode}
                onChange={(e) => setEnableCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={enableMutation.isPending}>
                Confirmer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                Annuler
              </Button>
            </div>
          </form>
        )}

        {user?.twoFactorEnabled && !disabling && (
          <Button variant="destructive" className="w-fit" onClick={() => setDisabling(true)}>
            <ShieldOff className="mr-1 size-4" /> Désactiver la 2FA
          </Button>
        )}

        {disabling && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              disableMutation.mutate();
            }}
            className="flex flex-col gap-3 max-w-sm"
          >
            <div className="flex flex-col gap-1.5">
              <Label>Code à 6 chiffres</Label>
              <Input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={disableMutation.isPending}>
                Confirmer la désactivation
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface Permission {
  id: string;
  key: string;
  group: string;
}

function ApiKeysCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.permissions.includes("*") ?? false;
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);

  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: () => api.get<ApiKeyItem[]>("/api-keys") });

  // Un admin (permissions === ['*']) choisit ses scopes dans le catalogue complet ;
  // un utilisateur normal ne peut choisir que parmi ses propres permissions (le
  // backend refuse de toute façon toute permission hors de celles de l'acteur).
  const catalogQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api.get<Permission[]>("/roles/permissions"),
    enabled: isAdmin,
  });
  const availableScopes = isAdmin
    ? (catalogQuery.data?.map((p) => p.key) ?? [])
    : (user?.permissions.filter((p) => p !== "*") ?? []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["api-keys"] });

  const createMutation = useMutation({
    mutationFn: () => api.post<{ name: string; key: string }>("/api-keys", { name, scopes }),
    onSuccess: (data) => {
      setNewKey(data);
      setCreating(false);
      setName("");
      setScopes([]);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      toast.success("Clé révoquée");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  function toggleScope(key: string) {
    setScopes((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clés API</CardTitle>
        <CardDescription>
          Authentifiez des scripts ou intégrations externes sans passer par un token de session qui expire — utilisez le
          même en-tête <code className="font-mono text-xs">Authorization: Bearer &lt;clé&gt;</code> que pour l&apos;app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {newKey && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="text-sm font-medium">
              Clé &quot;{newKey.name}&quot; créée — copiez-la maintenant, elle ne sera plus jamais affichée
            </p>
            <code className="break-all rounded bg-muted p-2 font-mono text-xs">{newKey.key}</code>
            <Button size="sm" variant="outline" className="w-fit" onClick={() => setNewKey(null)}>
              J&apos;ai copié ma clé
            </Button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Clé</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Dernière utilisation</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keysQuery.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Aucune clé API.
                </TableCell>
              </TableRow>
            )}
            {keysQuery.data?.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.keyPrefix}…</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Jamais utilisée"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Révoquer la clé "${k.name}" ?`)) revokeMutation.mutate(k.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!creating && (
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setCreating(true)}>
            <Plus className="mr-1 size-4" /> Nouvelle clé
          </Button>
        )}

        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="flex flex-col gap-3 rounded-md border p-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="CI backups" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Permissions</Label>
              <div className="flex max-h-48 flex-wrap gap-3 overflow-y-auto">
                {availableScopes.map((scope) => (
                  <label key={scope} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="size-4 rounded border"
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={createMutation.isPending || scopes.length === 0}>
                <KeyRound className="mr-1 size-4" /> Créer la clé
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
                Annuler
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
