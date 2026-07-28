import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const siteImages = sqliteTable("site_images", {
  slotId: text("slot_id").primaryKey(),
  mapSlug: text("map_slug").notNull(),
  siteIndex: integer("site_index").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  originalName: text("original_name").notNull(),
  updatedAt: text("updated_at").notNull(),
});
