import { PrismaClient } from '@prisma/client';
import { SYSTEM_USER_ID } from '../src/common/constants';

const prisma = new PrismaClient();

// Catalogue des permissions granulaires exposées par l'API. Le rôle "admin"
// (isSystem) obtient un accès total via le wildcard '*' géré dans
// JwtStrategy, indépendamment de cette table. Le rôle "client" reçoit un
// sous-ensemble de self-service ; la portée "propriétaire uniquement" est
// vérifiée séparément dans chaque service (ownerId === user.id).
const PERMISSIONS: { key: string; group: string }[] = [
  // Utilisateurs
  { key: 'users.read', group: 'users' },
  { key: 'users.create', group: 'users' },
  { key: 'users.update', group: 'users' },
  { key: 'users.suspend', group: 'users' },
  { key: 'users.ban', group: 'users' },
  { key: 'users.delete', group: 'users' },
  { key: 'users.impersonate', group: 'users' },
  // Rôles
  { key: 'roles.read', group: 'roles' },
  { key: 'roles.create', group: 'roles' },
  { key: 'roles.update', group: 'roles' },
  { key: 'roles.delete', group: 'roles' },
  // Audit
  { key: 'audit.read', group: 'audit' },
  // Nodes
  { key: 'nodes.read', group: 'nodes' },
  { key: 'nodes.create', group: 'nodes' },
  { key: 'nodes.update', group: 'nodes' },
  { key: 'nodes.delete', group: 'nodes' },
  { key: 'nodes.maintenance', group: 'nodes' },
  // Serveurs (admin, tous serveurs)
  { key: 'servers.read.any', group: 'servers' },
  { key: 'servers.update.any', group: 'servers' },
  { key: 'servers.delete.any', group: 'servers' },
  { key: 'servers.suspend', group: 'servers' },
  // Serveurs (self-service)
  { key: 'servers.create', group: 'servers' },
  { key: 'servers.read', group: 'servers' },
  { key: 'servers.update', group: 'servers' },
  { key: 'servers.delete', group: 'servers' },
  { key: 'servers.power', group: 'servers' },
  { key: 'servers.console', group: 'servers' },
  { key: 'servers.subusers', group: 'servers' },
  // Fichiers
  { key: 'files.read', group: 'files' },
  { key: 'files.write', group: 'files' },
  // Sauvegardes
  { key: 'backups.create', group: 'backups' },
  { key: 'backups.restore', group: 'backups' },
  { key: 'backups.delete', group: 'backups' },
  // Mods / modpacks
  { key: 'mods.install', group: 'mods' },
  { key: 'mods.remove', group: 'mods' },
  // Facturation
  { key: 'billing.read', group: 'billing' },
  { key: 'billing.manage', group: 'billing' },
  { key: 'billing.refund', group: 'billing' },
  // Marketplace
  { key: 'marketplace.read', group: 'marketplace' },
  { key: 'marketplace.publish', group: 'marketplace' },
  // Support
  { key: 'support.read.any', group: 'support' },
  { key: 'support.reply', group: 'support' },
  { key: 'support.create', group: 'support' },
  // Monitoring
  { key: 'monitoring.read', group: 'monitoring' },
];

const CLIENT_PERMISSIONS = [
  'servers.create',
  'servers.read',
  'servers.update',
  'servers.delete',
  'servers.power',
  'servers.console',
  'servers.subusers',
  'files.read',
  'files.write',
  'backups.create',
  'backups.restore',
  'backups.delete',
  'mods.install',
  'mods.remove',
  'billing.read',
  'marketplace.read',
  'support.create',
];

async function main() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { group: perm.group },
      create: perm,
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Accès total (bypass RBAC)', isSystem: true },
  });

  const clientRole = await prisma.role.upsert({
    where: { name: 'client' },
    update: {},
    create: { name: 'client', description: 'Utilisateur self-service', isSystem: true },
  });

  const clientPerms = await prisma.permission.findMany({
    where: { key: { in: CLIENT_PERMISSIONS } },
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: clientRole.id } });
  await prisma.rolePermission.createMany({
    data: clientPerms.map((p) => ({ roleId: clientRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  await prisma.user.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: 'system@elysia.local',
      username: 'system',
      status: 'ACTIVE',
      roleId: adminRole.id,
    },
  });

  console.log(`Seed terminé : ${PERMISSIONS.length} permissions, rôles "admin" (${adminRole.id}) et "client" (${clientRole.id}) créés, compte système prêt.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
