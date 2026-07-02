"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TicketMessage {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  author: { id: string; username: string };
}

interface TicketDetail {
  id: string;
  subject: string;
  status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  createdAt: string;
  messages: TicketMessage[];
}

const STATUSES: TicketDetail["status"][] = ["OPEN", "PENDING", "RESOLVED", "CLOSED"];

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const isStaff = hasPermission("support.reply");
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  const ticketQuery = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api.get<TicketDetail>(`/support/tickets/${id}`),
    refetchInterval: 10000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ticket", id] });

  const replyMutation = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/reply`, { body: reply }),
    onSuccess: () => {
      setReply("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketDetail["status"]) => api.post(`/support/tickets/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Erreur"),
  });

  const ticket = ticketQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/support" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux tickets
      </Link>

      {ticket && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
              <p className="text-sm text-muted-foreground">Ouvert le {new Date(ticket.createdAt).toLocaleString()}</p>
            </div>
            {isStaff ? (
              <Select value={ticket.status} onValueChange={(v) => v && statusMutation.mutate(v as TicketDetail["status"])}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">{ticket.status}</Badge>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {ticket.messages.map((m) => (
              <Card key={m.id} className={m.isStaff ? "border-primary/40 bg-primary/5" : ""}>
                <CardHeader className="flex-row items-center justify-between py-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    {m.author.username}
                    {m.isStaff && (
                      <Badge variant="secondary" className="text-xs">
                        Équipe
                      </Badge>
                    )}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap pt-0 text-sm">{m.body}</CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="pt-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reply.trim()) replyMutation.mutate();
                }}
                className="flex flex-col gap-3"
              >
                <Textarea
                  placeholder="Votre réponse..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  required
                />
                <div>
                  <Button type="submit" disabled={replyMutation.isPending || !reply.trim()}>
                    <Send className="mr-1 size-4" /> Répondre
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
