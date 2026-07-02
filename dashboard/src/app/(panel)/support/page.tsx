"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
}

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const ticketsQuery = useQuery({ queryKey: ["tickets"], queryFn: () => api.get<Ticket[]>("/support/tickets") });

  const createMutation = useMutation({
    mutationFn: () => api.post("/support/tickets", { subject, message }),
    onSuccess: () => {
      toast.success("Ticket créé");
      setOpen(false);
      setSubject("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">Ouvrez un ticket pour toute question ou problème.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-1 size-4" /> Nouveau ticket
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau ticket</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <Input placeholder="Sujet" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <Textarea
                placeholder="Décrivez votre problème..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
              />
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  Envoyer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {ticketsQuery.data?.map((t) => (
          <Link key={t.id} href={`/support/${t.id}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{t.subject}</CardTitle>
                <Badge variant="outline">{t.status}</Badge>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Créé le {new Date(t.createdAt).toLocaleString()}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
