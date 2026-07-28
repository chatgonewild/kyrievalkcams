import React from "react";
import { createRoot } from "react-dom/client";
import { SiegeAtlas } from "../app/siege-atlas";
import "../app/globals.css";

declare global {
  interface Window {
    __CAMLINE_GITHUB_PAGES__?: boolean;
  }
}

type StoredImage = {
  slotId: string;
  mapSlug: string;
  siteIndex: number;
  originalName: string;
  updatedAt: string;
  url: string;
  repoPath?: string;
};

type GitHubContent = {
  content?: string;
  sha?: string;
};

const owner = "chatgonewild";
const repo = "camline-valkyrie-atlas";
const branch = "main";
const pagesBase = `https://${owner}.github.io/${repo}/`;
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const originalFetch = window.fetch.bind(window);
let githubToken = "";
let githubLogin = "";

window.__CAMLINE_GITHUB_PAGES__ = true;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function apiHeaders(token = githubToken) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function textToBase64(text: string) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToText(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(path: string, init: RequestInit = {}, token = githubToken) {
  const response = await originalFetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...apiHeaders(token), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(detail.message ?? `GitHub returned ${response.status}.`);
  }
  return response;
}

async function readRepositoryImages() {
  const response = await originalFetch(`${pagesBase}data/images.json?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (response.status === 404) return [] as StoredImage[];
  if (!response.ok) throw new Error("Could not load the live image library.");
  const data = (await response.json()) as { images?: StoredImage[] };
  return Array.isArray(data.images) ? data.images : [];
}

async function readContent(path: string) {
  const response = await githubRequest(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${branch}`);
  return (await response.json()) as GitHubContent;
}

async function writeContent(path: string, content: string, message: string, sha?: string) {
  const response = await githubRequest(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, content, branch, ...(sha ? { sha } : {}) }),
  });
  return response.json();
}

async function deleteContent(path: string, message: string) {
  const current = await readContent(path).catch(() => null);
  if (!current?.sha) return;
  await githubRequest(`/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha: current.sha, branch }),
  });
}

async function repositoryImageDocument() {
  const current = await readContent("data/images.json").catch(() => null);
  if (!current?.content) return { images: [] as StoredImage[], sha: undefined as string | undefined };
  const parsed = JSON.parse(base64ToText(current.content)) as { images?: StoredImage[] };
  return {
    images: Array.isArray(parsed.images) ? parsed.images : [],
    sha: current.sha,
  };
}

async function signInWithGitHub(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const token = body.password?.trim() ?? "";
  if (!username || !token) return jsonResponse({ error: "Enter your GitHub username and token." }, 400);

  const userResponse = await originalFetch("https://api.github.com/user", {
    headers: apiHeaders(token),
    cache: "no-store",
  });
  if (!userResponse.ok) return jsonResponse({ error: "GitHub rejected that token." }, 401);
  const user = (await userResponse.json()) as { login?: string };
  if (user.login?.toLowerCase() !== username.toLowerCase() || user.login?.toLowerCase() !== owner) {
    return jsonResponse({ error: `This editor is restricted to @${owner}.` }, 403);
  }

  const repositoryResponse = await originalFetch(`${apiBase}`, {
    headers: apiHeaders(token),
    cache: "no-store",
  });
  const repository = (await repositoryResponse.json().catch(() => ({}))) as {
    permissions?: { push?: boolean };
  };
  if (!repositoryResponse.ok || !repository.permissions?.push) {
    return jsonResponse(
      { error: "The token needs Contents read/write access to this repository." },
      403,
    );
  }

  githubToken = token;
  githubLogin = user.login ?? username;
  return jsonResponse({ authenticated: true, username: githubLogin });
}

async function uploadImage(request: Request) {
  if (!githubToken) return jsonResponse({ error: "Admin sign-in required." }, 401);
  const form = await request.formData();
  const mapSlug = String(form.get("mapSlug") ?? "").trim();
  const siteIndex = Number(form.get("siteIndex"));
  const file = form.get("file");
  if (!/^[a-z0-9-]+$/.test(mapSlug) || !Number.isInteger(siteIndex) || siteIndex < 0 || siteIndex > 11) {
    return jsonResponse({ error: "Invalid map or site." }, 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return jsonResponse({ error: "Choose an image to upload." }, 400);
  }
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
    return jsonResponse({ error: "Use a JPEG, PNG, WebP, or AVIF image." }, 400);
  }
  if (file.size > 8 * 1024 * 1024) {
    return jsonResponse({ error: "Images must be 8 MB or smaller." }, 400);
  }

  const slotId = `${mapSlug}:${siteIndex}`;
  const extension =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
    ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[
      file.type
    ] ??
      "img");
  const repoPath = `public/uploads/${mapSlug}-${siteIndex}-${Date.now()}.${extension}`;
  const imageBytes = new Uint8Array(await file.arrayBuffer());
  await writeContent(repoPath, bytesToBase64(imageBytes), `Update ${slotId} camera image`);

  const document = await repositoryImageDocument();
  const previous = document.images.find((image) => image.slotId === slotId);
  const updatedAt = new Date().toISOString();
  const image: StoredImage = {
    slotId,
    mapSlug,
    siteIndex,
    originalName: file.name.slice(0, 180),
    updatedAt,
    repoPath,
    url: `${pagesBase}${repoPath}`,
  };
  const images = [image, ...document.images.filter((entry) => entry.slotId !== slotId)];
  await writeContent(
    "data/images.json",
    textToBase64(`${JSON.stringify({ images }, null, 2)}\n`),
    `Publish ${slotId} camera update`,
    document.sha,
  );
  if (previous?.repoPath && previous.repoPath !== repoPath) {
    await deleteContent(previous.repoPath, `Remove replaced ${slotId} camera image`).catch(() => undefined);
  }
  return jsonResponse({ ok: true, image }, 201);
}

async function removeImage(request: Request) {
  if (!githubToken) return jsonResponse({ error: "Admin sign-in required." }, 401);
  const slotId = new URL(request.url, window.location.href).searchParams.get("slotId") ?? "";
  if (!/^[a-z0-9-]+:\d+$/.test(slotId)) {
    return jsonResponse({ error: "Invalid image slot." }, 400);
  }
  const document = await repositoryImageDocument();
  const previous = document.images.find((image) => image.slotId === slotId);
  const images = document.images.filter((image) => image.slotId !== slotId);
  await writeContent(
    "data/images.json",
    textToBase64(`${JSON.stringify({ images }, null, 2)}\n`),
    `Clear ${slotId} camera image`,
    document.sha,
  );
  if (previous?.repoPath) {
    await deleteContent(previous.repoPath, `Remove ${slotId} camera image`).catch(() => undefined);
  }
  return jsonResponse({ ok: true });
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url, window.location.href);
  if (url.pathname === "/api/admin/session") {
    if (request.method === "POST") return signInWithGitHub(request);
    if (request.method === "DELETE") {
      githubToken = "";
      githubLogin = "";
      return jsonResponse({ authenticated: false });
    }
    return jsonResponse({ authenticated: Boolean(githubToken), username: githubLogin || undefined });
  }
  if (url.pathname === "/api/images") {
    try {
      if (request.method === "POST") return await uploadImage(request);
      if (request.method === "DELETE") return await removeImage(request);
      return jsonResponse({ images: await readRepositoryImages() });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : "GitHub update failed.", images: [] },
        500,
      );
    }
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiegeAtlas />
  </React.StrictMode>,
);
