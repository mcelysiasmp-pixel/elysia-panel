import { BadRequestException } from '@nestjs/common';

// Protection SSRF minimale : les URLs de téléchargement de mods/fichiers
// (retournées par les API Modrinth/CurseForge) doivent pointer vers l'un
// de ces CDN connus avant que le Backend n'aille les récupérer et les
// relayer au daemon. Empêche qu'une réponse d'API compromise/malveillante
// ne fasse effectuer une requête serveur vers une adresse interne
// (169.254.169.254, 127.0.0.1, réseau Docker interne, ...).
const ALLOWED_DOWNLOAD_HOSTS = [
  'cdn.modrinth.com',
  'github.com',
  'objects.githubusercontent.com',
  'edge.forgecdn.net',
  'mediafilez.forgecdn.net',
  'media.forgecdn.net',
];

export function assertSafeDownloadUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('URL de téléchargement invalide');
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException('Seules les URLs HTTPS sont autorisées');
  }

  const isAllowed = ALLOWED_DOWNLOAD_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
  if (!isAllowed) {
    throw new BadRequestException(`Hôte de téléchargement non autorisé: ${url.hostname}`);
  }
}
