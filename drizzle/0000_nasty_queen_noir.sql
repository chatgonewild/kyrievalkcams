CREATE TABLE `site_images` (
	`slot_id` text PRIMARY KEY NOT NULL,
	`map_slug` text NOT NULL,
	`site_index` integer NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`original_name` text NOT NULL,
	`updated_at` text NOT NULL
);
