"use client";

import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "./api-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:9401";

let socket: Socket | null = null;

// Connexion unique au namespace /ws du Backend (console, stats, notifications
// temps réel). Authentifiée avec le même access token JWT que l'API REST.
export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  socket = io(`${WS_URL}/ws`, {
    auth: { token: getAccessToken() },
    transports: ["websocket"],
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
