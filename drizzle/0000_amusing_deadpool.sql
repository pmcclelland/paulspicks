CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`espn_event_id` text,
	`round` integer NOT NULL,
	`region` text NOT NULL,
	`game_index` integer NOT NULL,
	`team1_id` integer,
	`team2_id` integer,
	`winner_team_id` integer,
	`team1_score` integer,
	`team2_score` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`start_time` text,
	`venue` text,
	`broadcast` text,
	`play_in_teams` text,
	FOREIGN KEY (`team1_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team2_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_espn_event_id_unique` ON `games` (`espn_event_id`);--> statement-breakpoint
CREATE TABLE `picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`picked_team_id` integer NOT NULL,
	`is_correct` integer,
	`points_earned` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`picked_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `picks_user_game_unique` ON `picks` (`user_id`,`game_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`espn_team_id` text NOT NULL,
	`name` text NOT NULL,
	`abbreviation` text NOT NULL,
	`seed` integer NOT NULL,
	`region` text NOT NULL,
	`logo_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_espn_team_id_unique` ON `teams` (`espn_team_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);