import crypto from 'node:crypto';
import { loadConfig } from '../config';

export interface WxLoginSession {
  openId: string;
  sessionKey: string;
}

interface Code2SessionResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

const buildMockSession = (code: string): WxLoginSession => {
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  const sessionKey = crypto.createHash('md5').update(code).digest('hex');
  return {
    openId: hash,
    sessionKey
  };
};

const callCode2Session = async (code: string, appId: string, appSecret: string): Promise<WxLoginSession> => {
  const endpoint = new URL('https://api.weixin.qq.com/sns/jscode2session');
  endpoint.searchParams.set('appid', appId);
  endpoint.searchParams.set('secret', appSecret);
  endpoint.searchParams.set('js_code', code);
  endpoint.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(endpoint.toString(), { method: 'GET' });
  if (!response.ok) {
    throw new Error(`code2session failed with status ${response.status}`);
  }
  const payload = (await response.json()) as Code2SessionResponse;
  if (payload.errcode) {
    throw new Error(`code2session error ${payload.errcode}: ${payload.errmsg ?? ''}`);
  }
  if (!payload.openid || !payload.session_key) {
    throw new Error('code2session response missing openid/session_key');
  }
  return {
    openId: payload.openid,
    sessionKey: payload.session_key
  };
};

export const exchangeCodeForSession = async (code: string): Promise<WxLoginSession> => {
  if (!code.trim()) {
    throw new Error('Invalid login code');
  }
  const config = loadConfig();
  if (config.wechat.mock) {
    return buildMockSession(code);
  }
  return callCode2Session(code, config.wechat.appId, config.wechat.appSecret);
};
