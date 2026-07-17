/**
 * Crypto helpers — password hashing (PBKDF2-SHA256) and JWT (HS256).
 * Uses the Web Crypto API built into Cloudflare Workers. No external deps.
 */

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

// ---------- password hashing ----------

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await pbkdf2(password, salt);
  return { hash: toHex(hash), salt: toHex(salt) };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const candidate = await pbkdf2(password, fromHex(storedSalt));
  return timingSafeEqual(toHex(candidate), storedHash);
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------- JWT (HS256) ----------

export interface JwtClaims {
  sub: string;          // user id
  email: string;
  iat: number;          // issued at (seconds)
  exp: number;          // expiry (seconds)
  type: 'access' | 'refresh';
}

const JWT_HEADER = { alg: 'HS256', typ: 'JWT' };

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? TEXT_ENCODER.encode(input) : input;
  // @ts-ignore — Workers support btoa/atob
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  // @ts-ignore
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(claims: Omit<JwtClaims, 'iat'>, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullClaims: JwtClaims = { ...claims, iat: now };
  const headerB64 = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullClaims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await hmacKey(secret);
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, TEXT_ENCODER.encode(signingInput));
  if (!valid) return null;
  const claims = JSON.parse(TEXT_DECODER.decode(base64UrlDecode(payloadB64))) as JwtClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) return null;
  return claims;
}

// ---------- random token generation ----------

export function generateToken(): string {
  return toHex(randomBytes(32));
}

export function generateUuid(): string {
  const bytes = randomBytes(16);
  // Set version (4) and variant bits per RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sha256(input: string): Promise<string> {
  const bytes = TEXT_ENCODER.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(hash));
}
