import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin").default(0),
  isSpectator: integer("is_spectator").default(0),
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
  conference: text("conference"),
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
  statusDetail: text("status_detail"), // e.g. "1st - 12:34", "Halftime"
  // Betting odds
  spreadLine: text("spread_line"),
  spreadDetails: text("spread_details"),
  moneylineTeam1: text("moneyline_team1"),
  moneylineTeam2: text("moneyline_team2"),
  overUnder: text("over_under"),
  oddsProvider: text("odds_provider"),
  // AI analysis cache
  aiAnalysis: text("ai_analysis"),
  aiAnalysisAt: text("ai_analysis_at"),
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

export const kenpomRankings = sqliteTable("kenpom_rankings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  teamName: text("team_name").notNull(),
  rank: integer("rank").notNull(),
  seed: integer("seed"),
  conference: text("conference"),
  record: text("record"),
  adjEM: text("adj_em"),        // adjusted efficiency margin
  adjO: text("adj_o"),          // adjusted offensive efficiency
  adjORank: integer("adj_o_rank"),
  adjD: text("adj_d"),          // adjusted defensive efficiency
  adjDRank: integer("adj_d_rank"),
  adjT: text("adj_t"),          // adjusted tempo
  adjTRank: integer("adj_t_rank"),
  luck: text("luck"),
  luckRank: integer("luck_rank"),
  sosEM: text("sos_em"),        // strength of schedule efficiency margin
  sosEMRank: integer("sos_em_rank"),
  sosO: text("sos_o"),          // SOS offensive
  sosORank: integer("sos_o_rank"),
  sosD: text("sos_d"),          // SOS defensive
  sosDRank: integer("sos_d_rank"),
  ncsos: text("ncsos"),         // non-conference SOS
  ncsosRank: integer("ncsos_rank"),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

export const playerStats = sqliteTable("player_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull().references(() => games.id),
  espnAthleteId: text("espn_athlete_id").notNull(),
  name: text("name").notNull(),
  teamId: integer("team_id").references(() => teams.id),
  minutes: integer("minutes").default(0),
  points: integer("points").default(0),
  rebounds: integer("rebounds").default(0),
  assists: integer("assists").default(0),
  steals: integer("steals").default(0),
  blocks: integer("blocks").default(0),
  turnovers: integer("turnovers").default(0),
  fgMade: integer("fg_made").default(0),
  fgAttempted: integer("fg_attempted").default(0),
  threePtMade: integer("three_pt_made").default(0),
  threePtAttempted: integer("three_pt_attempted").default(0),
  ftMade: integer("ft_made").default(0),
  ftAttempted: integer("ft_attempted").default(0),
}, (table) => [
  uniqueIndex("player_stats_game_athlete_unique").on(table.gameId, table.espnAthleteId),
]);

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
