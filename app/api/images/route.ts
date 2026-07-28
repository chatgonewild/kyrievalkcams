import { env } from "cloudflare:workers";
import { isAdminRequest, isSameOrigin } from "../../admin-auth";

type RuntimeEnv = {
  DB: D1Database;
  MEDIA: R2Bucket;
};

type ImageRow = {
  slot_id: string;
  map_slug: string;
  site_index: number;
  object_key: string;
  content_type: string;
  original_name: string;
  updated_at: string;
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxBytes = 8 * 1024 * 1024;

function bindings() {
  return env as unknown as RuntimeEnv;
}

export async function GET() {
  try {
    const { DB } = bindings();
    const result = await DB.prepare(
      `SELECT slot_id, map_slug, site_index, object_key, content_type, original_name, updated_at
       FROM site_images ORDER BY updated_at DESC`
    ).all<ImageRow>();
    const images = (result.results ?? []).map((row) => ({
      slotId: row.slot_id,
      mapSlug: row.map_slug,
      siteIndex: row.site_index,
      originalName: row.original_name,
      updatedAt: row.updated_at,
      url: `/api/media/${encodeURIComponent(row.object_key)}`,
    }));
    return Response.json({ images }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load images.", images: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request) || !(await isAdminRequest(request))) {
      return Response.json({ error: "Admin sign-in required." }, { status: 401 });
    }
    const data = await request.formData();
    const mapSlug = String(data.get("mapSlug") ?? "").trim();
    const siteIndex = Number(data.get("siteIndex"));
    const file = data.get("file");

    if (!/^[a-z0-9-]+$/.test(mapSlug) || !Number.isInteger(siteIndex) || siteIndex < 0 || siteIndex > 8) {
      return Response.json({ error: "Invalid map or site." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "Choose an image to upload." }, { status: 400 });
    }
    if (!allowedTypes.has(file.type)) {
      return Response.json({ error: "Use a JPEG, PNG, WebP, or AVIF image." }, { status: 400 });
    }
    if (file.size > maxBytes) {
      return Response.json({ error: "Images must be 8 MB or smaller." }, { status: 400 });
    }

    const { DB, MEDIA } = bindings();
    const id = `${mapSlug}:${siteIndex}`;
    const current = await DB.prepare("SELECT object_key FROM site_images WHERE slot_id = ?")
      .bind(id)
      .first<{ object_key: string }>();
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
    const objectKey = `${mapSlug}-${siteIndex}-${crypto.randomUUID()}.${extension}`;
    const updatedAt = new Date().toISOString();

    await MEDIA.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    });

    await DB.prepare(
      `INSERT INTO site_images
       (slot_id, map_slug, site_index, object_key, content_type, original_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slot_id) DO UPDATE SET
         object_key = excluded.object_key,
         content_type = excluded.content_type,
         original_name = excluded.original_name,
         updated_at = excluded.updated_at`
    )
      .bind(id, mapSlug, siteIndex, objectKey, file.type, file.name.slice(0, 180), updatedAt)
      .run();

    if (current?.object_key && current.object_key !== objectKey) {
      await MEDIA.delete(current.object_key);
    }

    return Response.json({ ok: true, slotId: id, updatedAt }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSameOrigin(request) || !(await isAdminRequest(request))) {
      return Response.json({ error: "Admin sign-in required." }, { status: 401 });
    }
    const id = new URL(request.url).searchParams.get("slotId") ?? "";
    if (!/^[a-z0-9-]+:\d+$/.test(id)) {
      return Response.json({ error: "Invalid image slot." }, { status: 400 });
    }
    const { DB, MEDIA } = bindings();
    const current = await DB.prepare("SELECT object_key FROM site_images WHERE slot_id = ?")
      .bind(id)
      .first<{ object_key: string }>();
    if (current?.object_key) await MEDIA.delete(current.object_key);
    await DB.prepare("DELETE FROM site_images WHERE slot_id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not clear image." },
      { status: 500 }
    );
  }
}
