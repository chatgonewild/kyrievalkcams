import React from "react";
import { createRoot } from "react-dom/client";
import { SiegeAtlas } from "../app/siege-atlas";
import "../app/globals.css";

declare global {
  interface Window {
    __KYRIE_VALK_CAMS_GITHUB_PAGES__?: boolean;
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

type GitHubRef = {
  object?: { sha?: string };
};

type GitHubCommit = {
  sha?: string;
  tree?: { sha?: string };
};

type GitHubObject = {
  sha?: string;
};

type GitTreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
};

type SavedGitHubSession = {
  username: string;
  token: string;
  expiresAt: number;
};

const owner = "chatgonewild";
const repo = "kyrievalkcams";
const branch = "main";
const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
const savedSessionKey = "kyrievalkcams.github-admin.v1";
const savedSessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const originalFetch = window.fetch.bind(window);
let githubToken = "";
let githubLogin = "";
let sessionValidation: Promise<boolean> | undefined;

window.__KYRIE_VALK_CAMS_GITHUB_PAGES__ = true;

function clearSavedSession() {
  try {
    localStorage.removeItem(savedSessionKey);
  } catch {
    // Signing out still clears the in-memory token when browser storage is unavailable.
  }
  githubToken = "";
  githubLogin = "";
  sessionValidation = undefined;
}

function persistSavedSession(username: string, token: string) {
  const saved: SavedGitHubSession = {
    username,
    token,
    expiresAt: Date.now() + savedSessionMaxAgeMs,
  };
  try {
    localStorage.setItem(savedSessionKey, JSON.stringify(saved));
  } catch {
    // Private browsing policies may limit storage; the current tab still stays signed in.
  }
}

function restoreSavedSession() {
  try {
    const raw = localStorage.getItem(savedSessionKey);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<SavedGitHubSession>;
    if (
      saved.username?.toLowerCase() !== owner ||
      !saved.token?.startsWith("github_pat_") ||
      typeof saved.expiresAt !== "number" ||
      saved.expiresAt <= Date.now()
    ) {
      clearSavedSession();
      return;
    }
    githubLogin = saved.username;
    githubToken = saved.token;
  } catch {
    clearSavedSession();
  }
}

restoreSavedSession();

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

function base64ToText(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function githubRequest(path: string, init: RequestInit = {}, token = githubToken) {
  const response = await originalFetch(`${apiBase}${path}`, {
    ...init,
    headers: { ...apiHeaders(token), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { message?: string };
    throw new GitHubApiError(detail.message ?? `GitHub returned ${response.status}.`, response.status);
  }
  return response;
}

async function readRepositoryImages() {
  if (githubToken) {
    return repositoryImageDocument();
  }
  const response = await originalFetch(`${rawBase}data/images.json?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (response.status === 404) return [] as StoredImage[];
  if (!response.ok) throw new Error("Could not load the live image library.");
  const data = (await response.json()) as { images?: StoredImage[] };
  return normalizeStoredImages(data.images);
}

function normalizeStoredImages(images?: StoredImage[]) {
  if (!Array.isArray(images)) return [] as StoredImage[];
  return images.map((image) => ({
    ...image,
    url: image.repoPath ? `${rawBase}${image.repoPath}` : image.url,
  }));
}

async function readContent(path: string, ref = branch) {
  const response = await githubRequest(
    `/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(ref)}`,
  );
  return (await response.json()) as GitHubContent;
}

async function repositoryImageDocument(ref = branch) {
  const current = await readContent("data/images.json", ref).catch((error) => {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  });
  if (!current?.content) return [] as StoredImage[];
  const parsed = JSON.parse(base64ToText(current.content)) as { images?: StoredImage[] };
  return normalizeStoredImages(parsed.images);
}

async function createBlob(content: string, encoding: "base64" | "utf-8") {
  const response = await githubRequest("/git/blobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, encoding }),
  });
  const result = (await response.json()) as GitHubObject;
  if (!result.sha) throw new Error("GitHub did not create the image data.");
  return result.sha;
}

async function branchSnapshot() {
  const refResponse = await githubRequest(`/git/ref/heads/${encodeURIComponent(branch)}`);
  const ref = (await refResponse.json()) as GitHubRef;
  const headSha = ref.object?.sha;
  if (!headSha) throw new Error("Could not read the current GitHub branch.");

  const [commitResponse, images] = await Promise.all([
    githubRequest(`/git/commits/${headSha}`),
    repositoryImageDocument(headSha),
  ]);
  const commit = (await commitResponse.json()) as GitHubCommit;
  const treeSha = commit.tree?.sha;
  if (!treeSha) throw new Error("Could not read the current GitHub file tree.");
  return { headSha, treeSha, images };
}

async function publishCommit(
  snapshot: Awaited<ReturnType<typeof branchSnapshot>>,
  images: StoredImage[],
  entries: GitTreeEntry[],
  message: string,
) {
  const manifestSha = await createBlob(`${JSON.stringify({ images }, null, 2)}\n`, "utf-8");
  const treeResponse = await githubRequest("/git/trees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: snapshot.treeSha,
      tree: [
        ...entries,
        {
          path: "data/images.json",
          mode: "100644",
          type: "blob",
          sha: manifestSha,
        },
      ],
    }),
  });
  const tree = (await treeResponse.json()) as GitHubObject;
  if (!tree.sha) throw new Error("GitHub did not create the updated file tree.");

  const commitResponse = await githubRequest("/git/commits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [snapshot.headSha],
    }),
  });
  const commit = (await commitResponse.json()) as GitHubCommit;
  if (!commit.sha) throw new Error("GitHub did not create the camera update.");

  await githubRequest(`/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
}

async function publishImageUpdate(
  build: (images: StoredImage[]) => {
    images: StoredImage[];
    entries: GitTreeEntry[];
    message: string;
  },
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const snapshot = await branchSnapshot();
    const update = build(snapshot.images);
    try {
      await publishCommit(snapshot, update.images, update.entries, update.message);
      return;
    } catch (error) {
      lastError = error;
      const branchChanged =
        error instanceof GitHubApiError && (error.status === 409 || error.status === 422);
      if (!branchChanged || attempt === 1) throw error;
    }
  }
  throw lastError;
}

async function validatedGitHubLogin(username: string, token: string) {
  const userResponse = await originalFetch("https://api.github.com/user", {
    headers: apiHeaders(token),
    cache: "no-store",
  });
  if (!userResponse.ok) throw new GitHubApiError("GitHub rejected that token.", 401);
  const user = (await userResponse.json()) as { login?: string };
  if (user.login?.toLowerCase() !== username.toLowerCase() || user.login?.toLowerCase() !== owner) {
    throw new GitHubApiError(`This editor is restricted to @${owner}.`, 403);
  }

  const repositoryResponse = await originalFetch(`${apiBase}`, {
    headers: apiHeaders(token),
    cache: "no-store",
  });
  const repository = (await repositoryResponse.json().catch(() => ({}))) as {
    permissions?: { push?: boolean };
  };
  if (!repositoryResponse.ok || !repository.permissions?.push) {
    throw new GitHubApiError(
      "The token needs Contents read/write access to this repository.",
      403,
    );
  }
  return user.login ?? username;
}

async function ensureGitHubSession() {
  if (!githubToken || !githubLogin) return false;
  sessionValidation ??= validatedGitHubLogin(githubLogin, githubToken)
    .then((login) => {
      githubLogin = login;
      persistSavedSession(githubLogin, githubToken);
      return true;
    })
    .catch(() => {
      clearSavedSession();
      return false;
    });
  return sessionValidation;
}

async function signInWithGitHub(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const token = body.password?.trim() ?? "";
  if (!username || !token) return jsonResponse({ error: "Enter your GitHub username and token." }, 400);

  try {
    githubLogin = await validatedGitHubLogin(username, token);
  } catch (error) {
    clearSavedSession();
    const status = error instanceof GitHubApiError ? error.status : 401;
    return jsonResponse(
      { error: error instanceof Error ? error.message : "GitHub rejected that token." },
      status,
    );
  }
  githubToken = token;
  sessionValidation = Promise.resolve(true);
  persistSavedSession(githubLogin, githubToken);
  return jsonResponse({ authenticated: true, username: githubLogin });
}

async function uploadImage(request: Request) {
  if (!(await ensureGitHubSession())) {
    return jsonResponse({ error: "Admin sign-in required." }, 401);
  }
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
  const updatedAt = new Date().toISOString();
  const image: StoredImage = {
    slotId,
    mapSlug,
    siteIndex,
    originalName: file.name.slice(0, 180),
    updatedAt,
    repoPath,
    url: `${rawBase}${repoPath}`,
  };
  const imageSha = await createBlob(bytesToBase64(imageBytes), "base64");
  await publishImageUpdate((images) => {
    const previous = images.find((entry) => entry.slotId === slotId);
    const entries: GitTreeEntry[] = [
      { path: repoPath, mode: "100644", type: "blob", sha: imageSha },
    ];
    if (previous?.repoPath && previous.repoPath !== repoPath) {
      entries.push({ path: previous.repoPath, mode: "100644", type: "blob", sha: null });
    }
    return {
      images: [image, ...images.filter((entry) => entry.slotId !== slotId)],
      entries,
      message: `Publish ${slotId} camera update`,
    };
  });
  return jsonResponse({ ok: true, image }, 201);
}

async function removeImage(request: Request) {
  if (!(await ensureGitHubSession())) {
    return jsonResponse({ error: "Admin sign-in required." }, 401);
  }
  const slotId = new URL(request.url, window.location.href).searchParams.get("slotId") ?? "";
  if (!/^[a-z0-9-]+:\d+$/.test(slotId)) {
    return jsonResponse({ error: "Invalid image slot." }, 400);
  }
  await publishImageUpdate((images) => {
    const previous = images.find((image) => image.slotId === slotId);
    return {
      images: images.filter((image) => image.slotId !== slotId),
      entries: previous?.repoPath
        ? [{ path: previous.repoPath, mode: "100644", type: "blob", sha: null }]
        : [],
      message: `Clear ${slotId} camera image`,
    };
  });
  return jsonResponse({ ok: true });
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url, window.location.href);
  if (url.pathname === "/api/admin/session") {
    if (request.method === "POST") return signInWithGitHub(request);
    if (request.method === "DELETE") {
      clearSavedSession();
      return jsonResponse({ authenticated: false });
    }
    const authenticated = await ensureGitHubSession();
    return jsonResponse({ authenticated, username: authenticated ? githubLogin : undefined });
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
