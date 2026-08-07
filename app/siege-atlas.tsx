"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { maps, type SiegeMap } from "./maps";

type ImageRecord = {
  slotId: string;
  mapSlug: string;
  siteIndex: number;
  originalName: string;
  updatedAt: string;
  url: string;
};

function isGitHubPages() {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as Window & { __KYRIE_VALK_CAMS_GITHUB_PAGES__?: boolean })
        .__KYRIE_VALK_CAMS_GITHUB_PAGES__,
    )
  );
}

function publicAsset(path: string) {
  return isGitHubPages() ? `/kyrievalkcams/public${path}` : path;
}

type UploadTarget = {
  map: SiegeMap;
  siteIndex: number;
  cameraIndex: number;
};

const camerasPerSite = 3;
const rankedMapSlugs = new Set([
  "bank",
  "border",
  "calypso-casino",
  "chalet",
  "clubhouse",
  "consulate",
  "fortress",
  "kafe-dostoyevsky",
  "kanal",
  "lair",
  "nighthaven-labs",
  "oregon",
  "theme-park",
  "villa",
]);
const originalMapSlugs = new Set([
  "bank",
  "border",
  "chalet",
  "clubhouse",
  "coastline",
  "consulate",
  "kafe-dostoyevsky",
  "kanal",
  "oregon",
  "outback",
  "theme-park",
  "villa",
]);

const originalSiteGroups: Record<string, Array<number | null>> = {
  bank: [3, 2, 1, 0],
  border: [3, 1, 2, 0],
  chalet: [3, 1, 2, 0],
  clubhouse: [3, 2, 1, 0],
  coastline: [2, 3, 1, 0],
  consulate: [3, 2, 1, 0],
  "kafe-dostoyevsky": [3, 1, 2, 0],
  kanal: [3, 2, 1, 0],
  oregon: [3, 1, 2, 0],
  outback: [3, 2, 1, 0],
  "theme-park": [3, 2, 1, 0],
  villa: [3, 2, 1, 0],
};

function combinedIndex(siteIndex: number, cameraIndex: number) {
  return siteIndex * camerasPerSite + cameraIndex;
}

function slotId(map: SiegeMap, siteIndex: number, cameraIndex: number) {
  return `${map.slug}:${combinedIndex(siteIndex, cameraIndex)}`;
}

function originalImage(map: SiegeMap, siteIndex: number, cameraIndex: number) {
  const sourceGroup = originalSiteGroups[map.slug]?.[siteIndex];
  if (sourceGroup === null || sourceGroup === undefined) return null;
  const number = sourceGroup * camerasPerSite + cameraIndex + 1;
  return publicAsset(`/original/${map.slug}-${String(number).padStart(2, "0")}.jpg`);
}

function CameraGlyph() {
  return (
    <span className="camera-glyph" aria-hidden="true">
      <span />
    </span>
  );
}

export function SiegeAtlas() {
  const [mode, setMode] = useState<"browse" | "admin">("browse");
  const [selectedSlug, setSelectedSlug] = useState(maps[0].slug);
  const [query, setQuery] = useState("");
  const [showRanked, setShowRanked] = useState(true);
  const [showNonRanked, setShowNonRanked] = useState(false);
  const [images, setImages] = useState<Record<string, ImageRecord>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshVersionRef = useRef(0);

  const refreshImages = useCallback(async () => {
    const refreshVersion = refreshVersionRef.current;
    try {
      const response = await fetch("/api/images", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { images: ImageRecord[] };
      if (refreshVersion !== refreshVersionRef.current) return;
      setImages(Object.fromEntries(data.images.map((image) => [image.slotId, image])));
    } catch {
      // The empty library is the intended first-run state.
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refreshImages(), 0);
    const timer = window.setInterval(refreshImages, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refreshImages]);

  useEffect(() => {
    if (!previewImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImage(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewImage]);

  const filteredMaps = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return maps
      .filter((map) => {
        const matchesQuery =
          !normalized ||
          map.name.toLowerCase().includes(normalized) ||
          map.location.toLowerCase().includes(normalized);
        const isRanked = rankedMapSlugs.has(map.slug);
        const matchesPool =
          mode === "admin" ||
          (isRanked ? showRanked : showNonRanked);
        return matchesQuery && matchesPool;
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [mode, query, showNonRanked, showRanked]);

  const poolTransitionKey = `${showRanked ? "ranked" : ""}-${showNonRanked ? "non-ranked" : ""}`;

  const selectedMap =
    filteredMaps.find((map) => map.slug === selectedSlug) ??
    filteredMaps[0] ??
    (mode === "admin" ? maps[0] : null);
  const totalSlots = maps.reduce((sum, map) => sum + map.sites.length * camerasPerSite, 0);
  const filledSlots = useMemo(
    () =>
      maps.reduce(
        (sum, map) =>
          sum +
          map.sites.reduce(
            (siteSum, _site, siteIndex) =>
              siteSum +
              Array.from({ length: camerasPerSite }).filter((_, cameraIndex) => {
                const id = slotId(map, siteIndex, cameraIndex);
                return Boolean(images[id] || originalImage(map, siteIndex, cameraIndex));
              }).length,
            0
          ),
        0
      ),
    [images]
  );

  function cameraImage(map: SiegeMap, siteIndex: number, cameraIndex: number) {
    const custom = images[slotId(map, siteIndex, cameraIndex)];
    return {
      src: custom ? `${custom.url}?v=${encodeURIComponent(custom.updatedAt)}` : originalImage(map, siteIndex, cameraIndex),
      custom,
    };
  }

  async function openAdmin() {
    setLoginError("");
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      const result = (await response.json()) as { authenticated?: boolean };
      if (result.authenticated) {
        setMode("admin");
        return;
      }
    } catch {
      // Fall through to the login dialog.
    }
    setLoginOpen(true);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { error?: string; authenticated?: boolean };
      if (!response.ok || !result.authenticated) {
        throw new Error(result.error ?? "Could not sign in.");
      }
      setPassword("");
      setLoginOpen(false);
      setMode("admin");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    setMode("browse");
    setNotice("");
  }

  function openUpload(map: SiegeMap, siteIndex: number, cameraIndex: number) {
    if (busy) return;
    setUploadTarget({ map, siteIndex, cameraIndex });
    fileRef.current?.click();
  }

  async function upload(files: File[]) {
    if (!uploadTarget || files.length === 0) return;
    const target = uploadTarget;
    const queue = files.slice(0, camerasPerSite - target.cameraIndex);
    setUploadTarget(null);
    refreshVersionRef.current += 1;
    let completed = 0;

    try {
      for (const [index, file] of queue.entries()) {
        const cameraIndex = target.cameraIndex + index;
        const targetId = slotId(target.map, target.siteIndex, cameraIndex);
        setBusy(targetId);
        setNotice(
          queue.length > 1
            ? `Uploading camera ${index + 1} of ${queue.length}…`
            : `Uploading ${target.map.name} · ${target.map.sites[target.siteIndex]} · Camera ${cameraIndex + 1}…`,
        );
        const form = new FormData();
        form.set("mapSlug", target.map.slug);
        form.set("siteIndex", String(combinedIndex(target.siteIndex, cameraIndex)));
        form.set("file", file);

        const response = await fetch("/api/images", { method: "POST", body: form });
        const result = (await response.json()) as { error?: string; image?: ImageRecord };
        if (!response.ok) {
          if (response.status === 401) {
            setMode("browse");
            setLoginOpen(true);
          }
          throw new Error(result.error ?? "Upload failed.");
        }
        if (result.image) {
          setImages((current) => ({ ...current, [targetId]: result.image! }));
        }
        completed += 1;
      }
      setNotice(
        `${target.map.name} · ${target.map.sites[target.siteIndex]} · ${completed} camera image${completed === 1 ? "" : "s"} updated live.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setNotice(completed ? `${completed} image${completed === 1 ? "" : "s"} uploaded. ${message}` : message);
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeImage(map: SiegeMap, siteIndex: number, cameraIndex: number) {
    const targetId = slotId(map, siteIndex, cameraIndex);
    refreshVersionRef.current += 1;
    setBusy(targetId);
    setNotice("");
    try {
      const response = await fetch(`/api/images?slotId=${encodeURIComponent(targetId)}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (response.status === 401) {
          setMode("browse");
          setLoginOpen(true);
        }
        throw new Error(result.error ?? "Could not remove image.");
      }
      setImages((current) => {
        const updated = { ...current };
        delete updated[targetId];
        return updated;
      });
      setNotice(
        originalImage(map, siteIndex, cameraIndex)
          ? `${map.name} custom image cleared; the original camera picture is restored.`
          : `${map.name} camera slot cleared.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove image.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        aria-label="Choose a camera image"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void upload(files);
        }}
      />

      {previewImage && (
        <div
          className="image-viewer-overlay"
          role="presentation"
          onMouseDown={() => setPreviewImage(null)}
        >
          <section
            className="image-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="Full-size camera image"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="image-viewer-close"
              aria-label="Close full-size image"
              autoFocus
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewImage.src} alt={previewImage.alt} />
          </section>
        </div>
      )}

      {loginOpen && (
        <div className="login-overlay" role="presentation" onMouseDown={() => setLoginOpen(false)}>
          <section
            className="login-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-login-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="login-close" aria-label="Close admin login" onClick={() => setLoginOpen(false)}>×</button>
            <p className="eyebrow"><span /> Restricted access</p>
            <h2 id="admin-login-title">Admin login</h2>
            <p>
              {isGitHubPages()
                ? "Connect your GitHub account to publish camera changes live."
                : "Sign in to manage the Black Eye camera library."}
            </p>
            <form onSubmit={signIn}>
              <label>
                {isGitHubPages() ? "GitHub username" : "Username"}
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  inputMode={isGitHubPages() ? "text" : "numeric"}
                  required
                  autoFocus
                />
              </label>
              <label>
                {isGitHubPages() ? "Fine-grained GitHub token" : "Password"}
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {loginError && <div className="login-error" role="alert">{loginError}</div>}
              <button className="login-submit" disabled={loginBusy}>
                {loginBusy ? "Checking…" : isGitHubPages() ? "Connect and edit" : "Enter control room"}
              </button>
            </form>
            {isGitHubPages() && (
              <p className="login-token-note">
                Use a fine-grained token limited to this repository with Contents read/write access.
                This browser remembers it for 30 days, or until you sign out.
              </p>
            )}
          </section>
        </div>
      )}

      <header className="topbar">
        <a className="brand" href="#top" aria-label="Camline home" onClick={() => setMode("browse")}>
          <span
            className="brand-mark"
            aria-hidden="true"
            style={{ backgroundImage: `url("${publicAsset("/camline-mark.png")}")` }}
          ><span /></span>
          <span>CAMLINE</span>
        </a>
        <button className="top-admin-button" onClick={() => void (mode === "admin" ? signOut() : openAdmin())}>
          <span /> {mode === "admin" ? "Sign out" : "Admin"}
        </button>
      </header>

      {mode === "browse" ? (
        <>
          <section className="hero" id="top">
            <div className="hero-copy">
              <p className="eyebrow"><span /> Defender intel // Valkyrie</p>
              <h1>Valkyrie<br /><em>camera spots.</em></h1>
              <p className="hero-deck">
                The Black Eye camera positions by <strong>Kyrie2781</strong>.
              </p>
              <div className="hero-actions">
                <a className="primary-button" href="#maps">Explore maps <span>↘</span></a>
              </div>
            </div>
            <div className="hero-panel" aria-label="Atlas status">
              <div
                className="operator-visual"
                role="img"
                aria-label="Valkyrie from Rainbow Six Siege"
              />
              <div className="panel-stats">
                <span><b>{maps.length}</b> maps</span>
                <span><b>{maps.reduce((sum, map) => sum + map.sites.length, 0)}</b> sites</span>
                <span><b>{filledSlots}</b> images</span>
              </div>
            </div>
          </section>

          <section className="map-browser" id="maps">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Black Eye map directory</p>
                <h2>Choose your ground</h2>
              </div>
              <p>Current Y11S2.2 rotation · July 2026</p>
            </div>

            <div className="toolbar">
              <label className="search">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search maps or locations"
                  aria-label="Search maps or locations"
                />
              </label>
              <div className="pool-switch" aria-label="Map pools">
                <button
                  className={showRanked ? "pool-button active" : "pool-button"}
                  aria-pressed={showRanked}
                  disabled={showRanked && !showNonRanked}
                  title={showRanked && !showNonRanked ? "At least one map pool must stay selected" : undefined}
                  onClick={() => {
                    setShowRanked((current) => !current);
                    setQuery("");
                  }}
                >
                  <span /> Ranked pool
                </button>
                <button
                  className={showNonRanked ? "pool-button active" : "pool-button"}
                  aria-pressed={showNonRanked}
                  disabled={showNonRanked && !showRanked}
                  title={showNonRanked && !showRanked ? "At least one map pool must stay selected" : undefined}
                  onClick={() => {
                    setShowNonRanked((current) => !current);
                    setQuery("");
                  }}
                >
                  <span /> Non-ranked maps
                </button>
              </div>
              <span className="result-count">
                {filteredMaps.length}{" "}
                {showRanked && showNonRanked
                  ? "maps"
                  : showRanked
                    ? "ranked maps"
                    : showNonRanked
                      ? "non-ranked maps"
                      : "maps selected"}
              </span>
            </div>

            <div className="browser-layout pool-content-transition" key={poolTransitionKey}>
              <div className="map-list" aria-label="Siege maps">
                {filteredMaps.map((map, index) => (
                  <button
                    key={map.slug}
                    className={map.slug === selectedMap?.slug ? "map-row active" : "map-row"}
                    onClick={() => setSelectedSlug(map.slug)}
                  >
                    <span className="map-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className="map-thumb" aria-hidden="true">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicAsset(`/maps/${map.slug}.jpg`)} alt="" loading="lazy" />
                    </span>
                    <span className="map-name">
                      <b>{map.name}</b>
                      <small>{map.location}</small>
                    </span>
                    {map.isNew && <span className="new-badge">NEW</span>}
                    <span className="map-arrow">↗</span>
                  </button>
                ))}
                {filteredMaps.length === 0 && (
                  <div className="empty-results">
                    {query ? `No maps match “${query}”.` : "No maps match the selected filters."}
                  </div>
                )}
              </div>

              {selectedMap && (
                <article className="map-detail">
                  <div className="map-detail-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={publicAsset(`/maps/${selectedMap.slug}.jpg`)}
                      alt={`${selectedMap.name} map overview`}
                    />
                    <div className="map-image-label">
                      <span>Selected ground</span>
                      <b>BLACK EYE // MAP INTEL</b>
                    </div>
                  </div>
                  <div className="map-detail-copy">
                    <div className="detail-topline">
                      <span>Valkyrie // {selectedMap.category}</span>
                      <span>{selectedMap.released}</span>
                    </div>
                    <h3>{selectedMap.name}</h3>
                    <p>{selectedMap.location}</p>
                    <div className="site-tabs" aria-label={`${selectedMap.name} bomb sites`}>
                      {selectedMap.sites.map((site, index) => (
                        <a key={site} href={`#${selectedMap.slug}-${index}`}>
                          <span>{String(index + 1).padStart(2, "0")}</span>{site}
                        </a>
                      ))}
                    </div>
                  </div>
                </article>
              )}
            </div>
          </section>

          {selectedMap && (
            <section
              className="site-gallery pool-content-transition"
              key={`${poolTransitionKey}-${selectedMap.slug}`}
            >
              <div className="gallery-title">
                <p className="eyebrow">Black Eye deployment library</p>
                <h2>{selectedMap.name}</h2>
                <p>{selectedMap.sites.length} objective areas · Images update automatically</p>
              </div>
              <div className="gallery-grid">
                {selectedMap.sites.map((site, siteIndex) => (
                  <article className="site-card" id={`${selectedMap.slug}-${siteIndex}`} key={site}>
                    <div className="site-camera-grid">
                      {Array.from({ length: camerasPerSite }).map((_, cameraIndex) => {
                        const image = cameraImage(selectedMap, siteIndex, cameraIndex);
                        return (
                          <div className="image-slot" key={cameraIndex}>
                            {image.src ? (
                              <button
                                className="image-open"
                                aria-label={`View ${selectedMap.name} ${site} camera ${cameraIndex + 1} full size`}
                                onClick={() =>
                                  setPreviewImage({
                                    src: image.src!,
                                    alt: `${selectedMap.name} ${site} Valkyrie camera position ${cameraIndex + 1}`,
                                  })
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={image.src}
                                  alt={`${selectedMap.name} ${site} Valkyrie camera position ${cameraIndex + 1}`}
                                />
                              </button>
                            ) : (
                              <div className="empty-slot">
                                <CameraGlyph />
                                <span>Open camera slot</span>
                                <small>{String(siteIndex + 1).padStart(2, "0")}.{cameraIndex + 1}</small>
                              </div>
                            )}
                            <span className="camera-label">CAM {cameraIndex + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="site-card-copy">
                      <span>SITE {String(siteIndex + 1).padStart(2, "0")}</span>
                      <h3>{site}</h3>
                      <p>{originalMapSlugs.has(selectedMap.slug) ? "Original setups included" : "Ready for new setups"}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="admin-shell">
          <aside className="admin-intro">
            <p className="eyebrow"><span /> Valkyrie control room</p>
            <h1>Media<br />library.</h1>
            <p>Upload or replace individual Black Eye setup images. Changes appear in the public atlas within seconds.</p>
            <div className="storage-meter">
              <div><span>{filledSlots}</span> / {totalSlots} slots filled</div>
              <div className="meter-track"><span style={{ width: `${(filledSlots / totalSlots) * 100}%` }} /></div>
            </div>
            <button className="back-button" onClick={() => setMode("browse")}>← Back to atlas</button>
          </aside>

          <div className="admin-content">
            <div className="admin-heading">
              <div>
                <p className="eyebrow">Black Eye asset manager</p>
                <h2>Camera spots</h2>
              </div>
              <label className="search compact">
                <span aria-hidden="true">⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter maps" aria-label="Filter maps" />
              </label>
            </div>
            {notice && <div className="notice" role="status">{notice}</div>}
            <div className="admin-map-list">
              {filteredMaps.map((map) => (
                <details key={map.slug} open={map.slug === selectedMap?.slug}>
                  <summary onClick={() => setSelectedSlug(map.slug)}>
                    <span>{map.name}</span>
                    <small>{map.sites.length * camerasPerSite} camera slots · {map.category}</small>
                    <i>⌄</i>
                  </summary>
                  <div className="admin-sites">
                    {map.sites.map((site, siteIndex) => (
                      <section className="admin-site-group" key={site}>
                        <h3><span>SITE {String(siteIndex + 1).padStart(2, "0")}</span>{site}</h3>
                        {Array.from({ length: camerasPerSite }).map((_, cameraIndex) => {
                          const id = slotId(map, siteIndex, cameraIndex);
                          const image = cameraImage(map, siteIndex, cameraIndex);
                          const isBusy = busy === id;
                          return (
                            <div className="admin-site-row" key={cameraIndex}>
                              <div className="admin-thumb">
                                {image.src ? (
                                  <button
                                    className="image-open"
                                    aria-label={`View ${map.name} ${site} camera ${cameraIndex + 1} full size`}
                                    onClick={() =>
                                      setPreviewImage({
                                        src: image.src!,
                                        alt: `${map.name} ${site} Valkyrie camera position ${cameraIndex + 1}`,
                                      })
                                    }
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={image.src} alt="" />
                                  </button>
                                ) : (
                                  <CameraGlyph />
                                )}
                              </div>
                              <div className="admin-site-name">
                                <span>CAMERA {String(cameraIndex + 1).padStart(2, "0")}</span>
                                <b>{image.custom ? "Custom camera image" : image.src ? "Original camera image" : "Empty camera slot"}</b>
                                <small>{image.custom?.originalName ?? (image.src ? "Imported from original site" : "No image uploaded")}</small>
                              </div>
                              <div className="admin-actions">
                                <button disabled={Boolean(busy)} onClick={() => openUpload(map, siteIndex, cameraIndex)}>
                                  {isBusy ? "Working…" : image.src ? "Replace" : "Upload"}
                                </button>
                                {image.custom && (
                                  <button
                                    className="remove"
                                    disabled={Boolean(busy)}
                                    onClick={() => void removeImage(map, siteIndex, cameraIndex)}
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer>
        <div className="brand compact-brand">
          <span
            className="brand-mark"
            aria-hidden="true"
            style={{ backgroundImage: `url("${publicAsset("/camline-mark.png")}")` }}
          ><span /></span>
          <span>CAMLINE</span>
        </div>
        <p>Made by Kyrie2781</p>
        <button onClick={() => void openAdmin()}>Admin panel ↗</button>
      </footer>
    </main>
  );
}
