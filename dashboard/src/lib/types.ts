export interface ServerTemplate {
  id: string;
  name: string;
  gameType: string;
  description: string | null;
  dockerImage: string;
  minMemoryMb: number;
}

export interface ServerSubUser {
  id: string;
  userId: string;
  permissions: string[];
  user: { id: string; username: string; email: string };
}

export interface ServerListItem {
  id: string;
  uuid: string;
  name: string;
  description: string | null;
  status: string;
  suspended: boolean;
  gameType: string;
  dockerImage: string;
  startupCommand: string;
  environment: Record<string, string>;
  cpuLimitPct: number;
  memoryLimitMb: number;
  diskLimitMb: number;
  node: { id: string; name: string; fqdn?: string };
  template: ServerTemplate;
  allocations: { id: string; ip: string; port: number; isPrimary: boolean }[];
  subUsers: ServerSubUser[];
  createdAt: string;
}

export interface NodeItem {
  id: string;
  name: string;
  fqdn: string;
  region: string | null;
  status: string;
  maintenanceMode: boolean;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  cpuAllocatedPct: number;
  memoryAllocatedMb: number;
  diskAllocatedMb: number;
  grpcHost: string;
  grpcPort: number;
  _count?: { servers: number };
}

export interface UserItem {
  id: string;
  email: string;
  username: string;
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  role: { id: string; name: string } | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { id: string; username: string; email: string } | null;
}

export interface MonitoringSummary {
  nodes: {
    total: number;
    online: number;
    cpuAllocatedPct: number;
    cpuCapacityPct: number;
    memoryAllocatedMb: number;
    memoryCapacityMb: number;
    diskAllocatedMb: number;
    diskCapacityMb: number;
  };
  servers: Record<string, number>;
  users: number;
  invoicesUnpaid: number;
}
