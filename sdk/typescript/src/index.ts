// =============================================================================
// SDK TypeScript officiel — Elysia Panel API
// Couvre les opérations les plus courantes ; pour tout le reste, la
// spécification complète est publiée par le Backend sur /api/docs-json
// (OpenAPI 3) et peut être utilisée avec n'importe quel générateur de
// client (openapi-generator, orval, ...). `request()` reste disponible
// comme échappatoire vers n'importe quel endpoint non encore couvert ici.
// =============================================================================

export interface ElysiaClientOptions {
  baseUrl: string; // ex: https://panel.example.com/api
  accessToken?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  roleId: string | null;
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class ElysiaApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Elysia API error (${status})`);
  }
}

export class ElysiaClient {
  private baseUrl: string;
  private accessToken?: string;

  constructor(options: ElysiaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  // Échappatoire générique vers n'importe quel endpoint documenté sur /api/docs.
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        /* ignore */
      }
      throw new ElysiaApiError(res.status, parsed);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- Auth -----------------------------------------------------------
  auth = {
    login: (email: string, password: string, totpCode?: string) =>
      this.request<TokenPair | { requiresTwoFactor: true }>('POST', '/auth/login', { email, password, totpCode }),
    register: (email: string, username: string, password: string) =>
      this.request<TokenPair>('POST', '/auth/register', { email, username, password }),
    me: () => this.request<AuthenticatedUser>('GET', '/auth/me'),
    refresh: (refreshToken: string) => this.request<TokenPair>('POST', '/auth/refresh', { refreshToken }),
  };

  // --- Serveurs ---------------------------------------------------------
  servers = {
    list: () => this.request<unknown[]>('GET', '/servers'),
    get: (id: string) => this.request<unknown>('GET', `/servers/${id}`),
    create: (payload: {
      name: string;
      templateId: string;
      cpuLimitPct: number;
      memoryLimitMb: number;
      diskLimitMb: number;
      environment?: Record<string, string>;
    }) => this.request('POST', '/servers', payload),
    power: (id: string, action: 'start' | 'stop' | 'restart' | 'kill') =>
      this.request(`POST`, `/servers/${id}/power/${action}`),
    sendCommand: (id: string, command: string) => this.request('POST', `/servers/${id}/command`, { command }),
    delete: (id: string) => this.request('DELETE', `/servers/${id}`),
  };

  // --- Sauvegardes --------------------------------------------------------
  backups = {
    list: (serverId: string) => this.request<unknown[]>('GET', `/servers/${serverId}/backups`),
    create: (serverId: string, name?: string) => this.request('POST', `/servers/${serverId}/backups`, { name }),
    restore: (serverId: string, backupId: string) =>
      this.request('POST', `/servers/${serverId}/backups/${backupId}/restore`),
  };

  // --- Nodes (admin) ------------------------------------------------------
  nodes = {
    list: () => this.request<unknown[]>('GET', '/nodes'),
    health: (id: string) => this.request<{ online: boolean }>('GET', `/nodes/${id}/health`),
  };
}

export default ElysiaClient;
