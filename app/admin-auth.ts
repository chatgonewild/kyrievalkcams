import { env } from "cloudflare:workers";

type AdminEnv = {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
};

const cookieName = "kyrievalkcams_admin";
const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function authEnv() {
  return env as unknown as AdminEnv;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function secureEqual(left: string, right: string) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function credentialsMatch(username: string, password: string) {
  const runtime = authEnv();
  if (!runtime.ADMIN_USERNAME || !runtime.ADMIN_PASSWORD) return false;
  const [usernameMatches, passwordMatches] = await Promise.all([
    secureEqual(username, runtime.ADMIN_USERNAME),
    secureEqual(password, runtime.ADMIN_PASSWORD),
  ]);
  return usernameMatches && passwordMatches;
}

export async function createAdminSession() {
  const secret = authEnv().ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Admin session secret is unavailable.");
  const expiresAt = Date.now() + sessionLifetimeMs;
  const payload = String(expiresAt);
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function isAdminRequest(request: Request) {
  const secret = authEnv().ADMIN_SESSION_SECRET;
  const token = cookieValue(request);
  if (!secret || !token) return false;
  const [expiresText, signature] = token.split(".");
  const expiresAt = Number(expiresText);
  if (!expiresText || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  if (expiresAt > Date.now() + sessionLifetimeMs + 60_000) return false;
  return secureEqual(signature, await hmac(expiresText, secret));
}

export function sessionCookie(token: string) {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionLifetimeMs / 1000}`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
