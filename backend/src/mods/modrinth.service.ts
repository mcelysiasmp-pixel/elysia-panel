import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { assertSafeDownloadUrl } from '../common/url-safety';

export interface ModrinthSearchResult {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    icon_url: string;
    downloads: number;
    categories: string[];
  }>;
  total_hits: number;
}

export interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  dependencies: Array<{ project_id: string | null; dependency_type: string }>;
  files: Array<{ url: string; filename: string; primary: boolean; size: number }>;
}

// Client Modrinth (étape 8 de la roadmap). https://docs.modrinth.com/api
@Injectable()
export class ModrinthService {
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.http = axios.create({
      baseURL: config.get<string>('modrinth.apiUrl'),
      headers: { 'User-Agent': 'elysia-panel/1.0 (contact: support@elysia.local)' },
    });
  }

  async search(params: {
    query?: string;
    facets?: string; // ex: [["categories:paper"],["project_type:mod"]] sérialisé
    limit?: number;
    offset?: number;
  }): Promise<ModrinthSearchResult> {
    const { data } = await this.http.get<ModrinthSearchResult>('/search', { params });
    return data;
  }

  async getProject(projectId: string) {
    const { data } = await this.http.get(`/project/${projectId}`);
    return data;
  }

  async getVersions(
    projectId: string,
    filters?: { loaders?: string[]; gameVersions?: string[] },
  ): Promise<ModrinthVersion[]> {
    const { data } = await this.http.get<ModrinthVersion[]>(`/project/${projectId}/version`, {
      params: {
        loaders: filters?.loaders ? JSON.stringify(filters.loaders) : undefined,
        game_versions: filters?.gameVersions ? JSON.stringify(filters.gameVersions) : undefined,
      },
    });
    return data;
  }

  async getVersion(versionId: string): Promise<ModrinthVersion> {
    const { data } = await this.http.get<ModrinthVersion>(`/version/${versionId}`);
    return data;
  }

  async downloadFile(url: string): Promise<Buffer> {
    assertSafeDownloadUrl(url);
    const { data } = await this.http.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
    return Buffer.from(data);
  }
}
