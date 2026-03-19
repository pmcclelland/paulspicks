import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin").default(0),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  espnTeamId: text("espn_team_id").unique().notNull(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  seed: integer("seed").notNull(),
  region: text("region").notNull(),
  logoUrl: text("logo_url"),
});

export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  espnEventId: text("espn_event_id").unique(),
  round: integer("round").notNull(),
  region: text("region").notNull(),
  gameIndex: integer("game_index").notNull(),
  team1Id: integer("team1_id").references(() => teams.id),
  team2Id: integer("team2_id").references(() => teams.id),
  winnerTeamId: integer("winner_team_id").references(() => teams.id),
  team1Score: integer("team1_score"),
  team2Score: integer("team2_score"),
  status: text("status").notNull().default("scheduled"),
  startTime: text("start_time"),
  venue: text("venue"),
  broadcast: text("broadcast"),
  playInTeams: text("play_in_teams"), // JSON: [{id, name, abbreviation, seed, logoUrl},...] for First Four slots
});

export const picks = sqliteTable("picks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id),
  pickedTeamId: integer("picked_team_id")
    .notNull()
    .references(() => teams.id),
  isCorrect: integer("is_correct"),
  pointsEarned: integer("points_earned").default(0),
}, (table) => [
  uniqueIndex("picks_user_game_unique").on(table.userId, table.gameId),
]);

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
