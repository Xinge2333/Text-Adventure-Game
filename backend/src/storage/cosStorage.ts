import fs from 'node:fs/promises';
import path from 'node:path';
import COS from 'cos-nodejs-sdk-v5';
import { loadConfig } from '../config';
import type { CatalogIndex } from '../services/themeIndex';

let cosClient: COS | null = null;

const getCosClient = (): COS => {
  if (cosClient) return cosClient;
  const {
    cos: { accessKey, secretKey }
  } = loadConfig();
  cosClient = new COS({ SecretId: accessKey, SecretKey: secretKey });
  return cosClient;
};

const readLocalIndex = async (localPath: string): Promise<CatalogIndex> => {
  const resolved = path.resolve(process.cwd(), localPath);
  const contents = await fs.readFile(resolved, 'utf8');
  return JSON.parse(contents) as CatalogIndex;
};

export const storage = {
  async fetchCatalogIndex(): Promise<CatalogIndex> {
    const config = loadConfig();
    if (config.cos.localPath) {
      return readLocalIndex(config.cos.localPath);
    }

    const client = getCosClient();
    const params = {
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: config.cos.indexKey
    };

    const data = await new Promise<any>((resolve, reject) => {
      client.getObject(params, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
    const bodyBuffer = Buffer.isBuffer(data.Body)
      ? data.Body
      : Buffer.from(data.Body as ArrayBuffer);
    const body = bodyBuffer.toString('utf8');
    return JSON.parse(body) as CatalogIndex;
  },

  async fetchThemePrompt(promptPath: string): Promise<string> {
    const config = loadConfig();
    if (config.cos.localPath) {
      const absolute = path.resolve(process.cwd(), '..', promptPath);
      return fs.readFile(absolute, 'utf8');
    }

    const client = getCosClient();
    const params = {
      Bucket: config.cos.bucket,
      Region: config.cos.region,
      Key: promptPath
    };

    const data = await new Promise<any>((resolve, reject) => {
      client.getObject(params, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });

    const bodyBuffer = Buffer.isBuffer(data.Body)
      ? data.Body
      : Buffer.from(data.Body as ArrayBuffer);
    return bodyBuffer.toString('utf8');
  }
};
