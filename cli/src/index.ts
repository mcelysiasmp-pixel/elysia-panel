#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ElysiaClient } from '@elysia-panel/sdk';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'elysia-cli');
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');

interface Session {
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
}

function loadSession(): Session | null {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

function requireClient(): ElysiaClient {
  const session = loadSession();
  if (!session) {
    console.error('Non connecté. Lancez `elysia login --url <api-url> --email <email> --password <password>`.');
    process.exit(1);
  }
  const client = new ElysiaClient({ baseUrl: session.baseUrl, accessToken: session.accessToken });
  return client;
}

const program = new Command();
program.name('elysia').description('CLI d\'administration Elysia Panel').version('0.1.0');

program
  .command('login')
  .requiredOption('--url <url>', 'URL de base de l\'API (ex: https://panel.example.com/api)')
  .requiredOption('--email <email>')
  .requiredOption('--password <password>')
  .action(async (opts) => {
    const client = new ElysiaClient({ baseUrl: opts.url });
    const result = await client.auth.login(opts.email, opts.password);
    if ('requiresTwoFactor' in result) {
      console.error('Ce compte a la 2FA activée — non supporté par ce CLI pour le moment.');
      process.exit(1);
    }
    saveSession({ baseUrl: opts.url, accessToken: result.accessToken, refreshToken: result.refreshToken });
    console.log('Connecté.');
  });

const servers = program.command('servers').description('Gestion des serveurs');

servers
  .command('list')
  .description('Liste vos serveurs')
  .action(async () => {
    const client = requireClient();
    const list = (await client.servers.list()) as Array<{ id: string; name: string; status: string }>;
    if (list.length === 0) {
      console.log('Aucun serveur.');
      return;
    }
    for (const s of list) {
      console.log(`${s.id}  ${s.name.padEnd(24)}  ${s.status}`);
    }
  });

servers
  .command('power <serverId> <action>')
  .description('start | stop | restart | kill')
  .action(async (serverId: string, action: string) => {
    if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
      console.error('Action invalide (attendu: start, stop, restart, kill)');
      process.exit(1);
    }
    const client = requireClient();
    await client.servers.power(serverId, action as 'start' | 'stop' | 'restart' | 'kill');
    console.log(`Action "${action}" envoyée au serveur ${serverId}.`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
