"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ServerListItem } from "@/lib/types";

const SFTP_PORT = process.env.NEXT_PUBLIC_SFTP_PORT ?? "9522";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-sm">{value}</code>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

export function SftpPanel({ server }: { server: ServerListItem }) {
  const { user } = useAuth();
  const host = server.node.fqdn || server.node.name;
  const username = user ? `${user.username}.${server.uuid.slice(0, 8)}` : "...";

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Connectez-vous à ce serveur avec n&apos;importe quel client SFTP (FileZilla, WinSCP, Cyberduck, ou en
          ligne de commande). Le mot de passe est celui de votre compte Elysia Panel.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CopyField label="Hôte" value={host} />
          <CopyField label="Port" value={SFTP_PORT} />
          <CopyField label="Utilisateur" value={username} />
          <CopyField label="Mot de passe" value="(celui de votre compte Elysia Panel)" />
        </div>
        <CopyField label="Commande" value={`sftp -P ${SFTP_PORT} ${username}@${host}`} />
      </CardContent>
    </Card>
  );
}
