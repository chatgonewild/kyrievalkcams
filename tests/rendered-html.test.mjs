import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("contains the complete Kyrie Valk Cams atlas experience", async () => {
  const [atlas, layout, mapData, adminRoute] = await Promise.all([
    readFile(new URL("../app/siege-atlas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/maps.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/session/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Kyrie Valk Cams — Valkyrie Camera Atlas/i);
  assert.match(atlas, /Valkyrie<br \/><em>camera spots\.<\/em>/i);
  assert.match(atlas, /Choose your ground/i);
  assert.match(atlas, /top-admin-button/i);
  assert.match(atlas, /Admin login/i);
  assert.match(adminRoute, /credentialsMatch/i);
  assert.match(mapData, /Calypso Casino/i);
  assert.match(
    mapData,
    /sites: \["2F Cigar Room \/ 2F Pool", "1F Blackjack \/ 1F Poker", "1F Bar \/ 1F Betting", "B CCTV \/ B Vault Checkpoint"\]/,
  );
  assert.match(
    mapData,
    /sites: \["2F Pink Room \/ 2F Car Room", "2F Master Bedroom \/ 2F Car Room", "1F TV Room \/ 1F Music Room", "B Gym \/ B Garage"\]/,
  );
  assert.match(
    mapData,
    /sites: \["2F Meeting Room \/ 2F Executive Office", "2F Executive Bedroom \/ 2F Staff Section", "1F Cargo Hold \/ 1F Luggage Hold"\]/,
  );
  assert.match(mapData, /Nighthaven Labs/i);
  assert.doesNotMatch(atlas + layout, /Always watching|Know the angle|codex-preview|Your site is taking shape/i);
});

test("publishes admin images atomically without waiting for a Pages deployment", async () => {
  const [pagesEntry, workflow] = await Promise.all([
    readFile(new URL("../github-pages/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(pagesEntry, /raw\.githubusercontent\.com/);
  assert.match(pagesEntry, /publishCommit/);
  assert.match(pagesEntry, /\/git\/trees/);
  assert.match(pagesEntry, /\/git\/commits/);
  assert.match(pagesEntry, /\/git\/refs\/heads/);
  assert.match(workflow, /paths-ignore:/);
  assert.match(workflow, /public\/uploads\/\*\*/);
  assert.match(workflow, /data\/images\.json/);
});

test("remembers the GitHub Pages admin session and serializes uploads", async () => {
  const [pagesEntry, atlas, pagesConfig] = await Promise.all([
    readFile(new URL("../github-pages/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/siege-atlas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../github-pages/vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(pagesEntry, /savedSessionKey/);
  assert.match(pagesEntry, /localStorage\.setItem/);
  assert.match(pagesEntry, /localStorage\.removeItem/);
  assert.match(pagesEntry, /restoreSavedSession\(\)/);
  assert.match(pagesEntry, /await ensureGitHubSession\(\)/);
  assert.match(pagesEntry, /if \(githubToken\) \{\s+return repositoryImageDocument\(\)/);
  assert.match(atlas, /This browser remembers it for 30 days/);
  assert.match(atlas, /disabled=\{Boolean\(busy\)\}/);
  assert.match(atlas, /refreshVersionRef/);
  assert.match(atlas, /refreshVersion !== refreshVersionRef\.current/);
  assert.match(atlas, /multiple/);
  assert.match(atlas, /Uploading camera \$\{index \+ 1\} of \$\{queue\.length\}/);
  assert.match(atlas, /image-viewer-overlay/);
  assert.match(atlas, /event\.key === "Escape"/);
  assert.match(pagesConfig, /entryFileNames: "static\/app-\[hash\]\.js"/);
});

test("ships persistence, original camera pictures, and social artwork", async () => {
  const [hosting, migration, originalImages, mapImages, atlas] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_nasty_queen_noir.sql", import.meta.url), "utf8"),
    readdir(new URL("../public/original/", import.meta.url)),
    readdir(new URL("../public/maps/", import.meta.url)),
    readFile(new URL("../app/siege-atlas.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "MEDIA"/);
  assert.match(migration, /CREATE TABLE `site_images`/);
  assert.equal(originalImages.length, 144);
  assert.ok(originalImages.includes("bank-01.jpg"));
  assert.ok(originalImages.includes("villa-12.jpg"));
  assert.equal(mapImages.length, 27);
  assert.ok(mapImages.includes("calypso-casino.jpg"));
  assert.ok(mapImages.includes("district.jpg"));
  assert.ok(mapImages.includes("yacht.jpg"));
  assert.match(atlas, /className="map-thumb"/);
  assert.match(atlas, /className="map-detail-image"/);
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
