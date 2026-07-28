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
  assert.match(mapData, /Nighthaven Labs/i);
  assert.doesNotMatch(atlas + layout, /Always watching|Know the angle|codex-preview|Your site is taking shape/i);
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
