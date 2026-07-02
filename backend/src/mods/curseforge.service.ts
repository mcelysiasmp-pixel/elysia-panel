import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface CurseForgeSearchResult {
  data: Array<{
    id: number;
    name: string;
    slug: string;
    summary: string;
    logo?: { thumbnailUrl: string };
    downloadCount: number;
  }>;
  pagination: { totalCount: number };
}

export interface CurseForgeFile {
  id: number;
  fileName: string;
  downloadUrl: string;
  gameVersions: string[];
  dependencies: Array<{ modId: number; relationType: number }>;
  fileLength: number;
}

const MINECRAFT_GAME_ID = 432;

// Client CurseForge (étape 9 de la roadmap). https://docs.curseforge.com/
@Injectable()
export class CurseforgeService {
  private readonly http: AxiosInstance;

  constructor(config: ConfigService) {
    this.http = axios.create({
      baseURL: config.get<string>('curseforge.apiUrl'),
      headers: { 'x-api-key': config.get<string>('curseforge.apiKey') ?? '' },
    });
  }

  async search(params: {
    searchFilter?: string;
    classId?: number; // 6 = mods, 12 = resource packs, 4471 = modpacks
    gameVersion?: string;
    pageSize?: number;
    index?: number;
  }): Promise<CurseForgeSearchResult> {
    const { data } = await this.http.get<CurseForgeSearchResult>('/mods/search', {
      params: { gameId: MINECRAFT_GAME_ID, ...params },
    });
    return data;
  }

  async getMod(modId: number) {
    const { data } = await this.http.get(`/mods/${modId}`);
    return data.data;
  }

  async getFiles(modId: number): Promise<{ data: CurseForgeFile[] }> {
    const { data } = await this.http.get<{ data: CurseForgeFile[] }>(`/mods/${modId}/files`);
    return data;
  }

  async getFile(modId: number, fileId: number): Promise<CurseForgeFile> {
    const { data } = await this.http.get<{ data: CurseForgeFile }>(`/mods/${modId}/files/${fileId}`);
    return data.data;
  }

  async downloadFile(url: string): Promise<Buffer> {
    const { data } = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
    return Buffer.from(data);
  }
}
