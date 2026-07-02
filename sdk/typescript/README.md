# @elysia-panel/sdk

SDK TypeScript pour l'API Elysia Panel.

```ts
import { ElysiaClient } from '@elysia-panel/sdk';

const client = new ElysiaClient({ baseUrl: 'https://panel.example.com/api' });
const { accessToken } = await client.auth.login('user@example.com', 'password');
client.setAccessToken(accessToken);

const servers = await client.servers.list();
await client.servers.power(servers[0].id, 'restart');
```

Pour toute opération non encore couverte par les méthodes typées
(`auth`, `servers`, `backups`, `nodes`), utilisez `client.request(method,
path, body)` — la liste complète des endpoints est publiée par le Backend
sur `/api/docs-json` (OpenAPI 3).
