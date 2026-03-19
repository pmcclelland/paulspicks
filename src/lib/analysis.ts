import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type KenpomStats = {
  rank: number;
  adjEM: string;
  adjO: string;
  adjORank: number;
  adjD: string;
  adjDRank: number;
} | null;

export async function generateMatchupAnalysis(
  team1: { name: string; seed: number; region: string },
  team2: { name: string; seed: number; region: string },
  odds: {
    spread?: string | null;
    moneyline1?: string | null;
    moneyline2?: string | null;
    overUnder?: string | null;
  },
  round: number,
  kenpom1?: KenpomStats,
  kenpom2?: KenpomStats
): Promise<string> {
  const roundNames: Record<number, string> = {
    1: "Round of 64",
    2: "Round of 32",
    3: "Sweet 16",
    4: "Elite 8",
    5: "Final Four",
    6: "National Championship",
  };

  const oddsContext = [
    odds.spread ? `Spread: ${odds.spread}` : null,
    odds.moneyline1 && odds.moneyline2
      ? `Moneyline: ${team1.name} ${odds.moneyline1}, ${team2.name} ${odds.moneyline2}`
      : null,
    odds.overUnder ? `Over/Under: ${odds.overUnder}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  let kenpomContext = "";
  if (kenpom1 || kenpom2) {
    const lines: string[] = [];
    if (kenpom1) {
      lines.push(`${team1.name} KenPom: #${kenpom1.rank} overall, AdjEM ${kenpom1.adjEM}, Off Eff ${kenpom1.adjO} (#${kenpom1.adjORank}), Def Eff ${kenpom1.adjD} (#${kenpom1.adjDRank})`);
    }
    if (kenpom2) {
      lines.push(`${team2.name} KenPom: #${kenpom2.rank} overall, AdjEM ${kenpom2.adjEM}, Off Eff ${kenpom2.adjO} (#${kenpom2.adjORank}), Def Eff ${kenpom2.adjD} (#${kenpom2.adjDRank})`);
    }
    kenpomContext = "\nKenPom Ratings:\n" + lines.join("\n");
  }

  const prompt = `Give a brief 2-3 sentence matchup analysis for this NCAA March Madness game:

${team1.name} (${team1.seed} seed) vs ${team2.name} (${team2.seed} seed)
Round: ${roundNames[round] || `Round ${round}`}
Region: ${team1.region}
${oddsContext ? `Odds: ${oddsContext}` : "No odds available yet."}${kenpomContext}

Consider seed matchup history, the odds implications, KenPom efficiency ratings (especially offensive vs defensive matchups), and round context. Be concise and insightful. Do not use headers or bullet points — just a short paragraph.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}
