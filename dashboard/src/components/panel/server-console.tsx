"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface ConsoleLineEvent {
  serverId: string;
  line: string;
  stream: string;
  timestamp_ms: number;
}

export function ServerConsole({ serverId }: { serverId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("console:subscribe", { serverId });

    const onLine = (evt: ConsoleLineEvent) => {
      if (evt.serverId !== serverId) return;
      setLines((prev) => [...prev.slice(-500), evt.line]);
    };
    const onError = (evt: { serverId: string; message: string }) => {
      if (evt.serverId !== serverId) return;
      setLines((prev) => [...prev, `[erreur] ${evt.message}`]);
    };

    socket.on("console:line", onLine);
    socket.on("console:error", onError);

    return () => {
      socket.emit("console:unsubscribe", { serverId });
      socket.off("console:line", onLine);
      socket.off("console:error", onError);
    };
  }, [serverId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  function sendCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) return;
    getSocket().emit("console:send", { serverId, command });
    setCommand("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        className="h-96 overflow-y-auto rounded-md border bg-black p-3 font-mono text-xs text-green-400"
      >
        {lines.length === 0 && <p className="text-muted-foreground">En attente de logs...</p>}
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {line}
          </div>
        ))}
      </div>
      <form onSubmit={sendCommand} className="flex gap-2">
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Envoyer une commande..."
          className="font-mono"
        />
        <Button type="submit" size="icon">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
