CREATE TABLE `player_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`espn_athlete_id` text NOT NULL,
	`name` text NOT NULL,
	`team_id` integer,
	`minutes` integer DEFAULT 0,
	`points` integer DEFAULT 0,
	`rebounds` integer DEFAULT 0,
	`assists` integer DEFAULT 0,
	`steals` integer DEFAULT 0,
	`blocks` integer DEFAULT 0,
	`turnovers` integer DEFAULT 0,
	`fg_made` integer DEFAULT 0,
	`fg_attempted` integer DEFAULT 0,
	`three_pt_made` integer DEFAULT 0,
	`three_pt_attempted` integer DEFAULT 0,
	`ft_made` integer DEFAULT 0,
	`ft_attempted` integer DEFAULT 0,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_stats_game_athlete_unique` ON `player_stats` (`game_id`,`espn_athlete_id`);