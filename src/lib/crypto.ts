import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const key = createHash('sha256').update('enc:' + config.appSecret).digest();

/** AES-256-GCM 암호화 → "v1:iv:tag:data" (base64) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(enc: string): string | null {
  try {
    const [v, iv, tag, data] = enc.split(':');
    if (v !== 'v1') return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // APP_SECRET 이 바뀌었거나 손상
  }
}

export function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** 화면 표시용 키 가리기: sk-ant-api03-abcd...wxyz */
export function maskKey(k: string): string {
  if (!k) return '';
  if (k.length <= 12) return k.slice(0, 2) + '…' + k.slice(-2);
  return k.slice(0, 10) + '…' + k.slice(-4);
}
