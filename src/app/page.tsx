import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col bg-[#EFF5FA]">
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden bg-[#0F1E33]">
        {/* Ambient background */}
        <div className="absolute inset-0">
          {/* Radial glow behind logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-[600px] h-[600px] rounded-full bg-[#1B365D] opacity-60 blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] w-[300px] h-[300px] rounded-full bg-[#C8DDE8] opacity-15 blur-[80px]" />
          {/* Diagonal accent line */}
          <div className="absolute -top-20 -right-20 w-[500px] h-[500px] border border-[#F4793B]/[0.08] rounded-full" />
          <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] border border-white/[0.04] rounded-full" />
          {/* Bracket-line decorations */}
          <svg className="absolute right-[8%] top-[15%] opacity-[0.06]" width="120" height="200" viewBox="0 0 120 200">
            <path d="M0 0 H40 V100 H80 M0 200 H40 V100" stroke="white" strokeWidth="2" fill="none" />
          </svg>
          <svg className="absolute left-[8%] bottom-[15%] opacity-[0.06]" width="120" height="200" viewBox="0 0 120 200">
            <path d="M120 0 H80 V100 H40 M120 200 H80 V100" stroke="white" strokeWidth="2" fill="none" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-20 sm:pt-20 sm:pb-28">
          <div className="flex flex-col items-center text-center">
            {/* Logo with glow treatment */}
            <div className="relative mb-8">
              <div className="absolute inset-0 scale-110 rounded-2xl bg-[#C8DDE8]/10 blur-2xl" />
              <img
                src="/logo.png"
                alt="Paul's Picks"
                className="relative h-44 sm:h-56 w-auto rounded-2xl shadow-2xl shadow-black/30"
              />
            </div>

            {/* Tagline */}
            <p className="text-[#C8DDE8] text-lg sm:text-xl font-medium tracking-wide">
              March Madness 2026 Bracket Pool
            </p>

            <p className="mt-4 text-white/50 text-base max-w-lg leading-relaxed">
              Pick your winners. Climb the ranks. 63 games, one champion,
              bragging rights forever.
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
              <Link href="/bracket">
                <Button
                  size="lg"
                  className="bg-[#F4793B] hover:bg-[#E06830] text-white font-bold text-base px-8 py-6 rounded-xl shadow-lg shadow-[#F4793B]/25 hover:shadow-xl hover:shadow-[#F4793B]/30 transition-all hover:-translate-y-0.5"
                >
                  Fill Out Your Bracket
                </Button>
              </Link>
              <Link href="/leaderboard">
                <Button
                  size="lg"
                  className="bg-white/[0.07] hover:bg-white/[0.12] text-white/80 hover:text-white border border-white/[0.12] font-semibold text-base px-8 py-6 rounded-xl transition-all hover:-translate-y-0.5"
                >
                  View Leaderboard
                </Button>
              </Link>
            </div>

            {/* Quick stats strip */}
            <div className="mt-14 flex items-center gap-8 sm:gap-12">
              {[
                { value: "63", label: "Games" },
                { value: "6", label: "Rounds" },
                { value: "1,920", label: "Max Points" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">
                    {stat.value}
                  </div>
                  <div className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mt-1">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom edge transition */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F4793B]/30 to-transparent" />
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-[#F4793B] uppercase tracking-[0.2em] mb-3">
              Getting Started
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1B365D]">
              Three Steps to Glory
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Create Your Account",
                desc: "Sign up with your email in seconds and join the pool.",
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                ),
              },
              {
                step: "02",
                title: "Fill Your Bracket",
                desc: "Pick winners for all 63 games before the first tipoff.",
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Climb the Board",
                desc: "Earn points each round and watch your rank rise.",
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.52.587 6.023 6.023 0 0 1-2.52-.587" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg border border-[#BFD4E4]/60 transition-all hover:-translate-y-1"
              >
                {/* Step number */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-[#1B365D] flex items-center justify-center text-white group-hover:bg-[#F4793B] transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-xs font-extrabold text-[#1B365D]/20 uppercase tracking-widest">
                    Step {item.step}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#1B365D] mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-[#5A7A99] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SCORING ─── */}
      <section className="py-20 sm:py-28 bg-[#1B365D] relative overflow-hidden">
        {/* Background texture */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        </div>

        <div className="relative mx-auto max-w-4xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-[#F4793B] uppercase tracking-[0.2em] mb-3">
              Points System
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Every Round Counts More
            </h2>
            <p className="mt-3 text-white/40 text-sm max-w-md mx-auto">
              Points double each round. Nail the championship and you&apos;re a legend.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { round: "R64", games: 32, pts: 10 },
              { round: "R32", games: 16, pts: 20 },
              { round: "S16", games: 8, pts: 40 },
              { round: "E8", games: 4, pts: 80 },
              { round: "F4", games: 2, pts: 160 },
              { round: "CHAMP", games: 1, pts: 320 },
            ].map((r, i) => (
              <div
                key={r.round}
                className="relative bg-white/[0.06] backdrop-blur-sm rounded-xl p-5 text-center border border-white/[0.08] hover:border-[#F4793B]/30 transition-colors group"
              >
                <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">
                  {r.round}
                </div>
                <div className="text-3xl font-extrabold text-white group-hover:text-[#F4793B] transition-colors">
                  {r.pts}
                </div>
                <div className="text-[11px] text-white/40 mt-1">
                  pts/win
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.08]">
                  <span className="text-xs text-white/30">
                    {r.games} {r.games === 1 ? "game" : "games"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <span className="inline-flex items-center gap-2 bg-[#F4793B]/10 text-[#F4793B] font-bold text-sm px-5 py-2.5 rounded-full border border-[#F4793B]/20">
              <span className="text-lg">1,920</span>
              <span className="text-[#F4793B]/70 font-medium">maximum points</span>
            </span>
          </div>
        </div>
      </section>

      {/* ─── TOURNAMENT INFO ─── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold text-[#F4793B] uppercase tracking-[0.2em] mb-3">
              2026 Tournament
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1B365D]">
              Key Dates & Rules
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Dates */}
            <div className="bg-white rounded-2xl border border-[#BFD4E4]/60 overflow-hidden">
              <div className="px-6 py-4 bg-[#1B365D]">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Schedule
                </h3>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { date: "Mar 15", event: "Selection Sunday" },
                  { date: "Mar 17–18", event: "First Four" },
                  { date: "Mar 19–22", event: "First & Second Round" },
                  { date: "Mar 26–29", event: "Sweet 16 & Elite 8" },
                  { date: "Apr 4", event: "Final Four" },
                  { date: "Apr 6", event: "Championship" },
                ].map((item) => (
                  <div key={item.date} className="flex items-center gap-4">
                    <span className="text-xs font-bold text-[#F4793B] w-20 flex-shrink-0 tabular-nums">
                      {item.date}
                    </span>
                    <span className="text-sm text-[#1B365D]">{item.event}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            <div className="bg-white rounded-2xl border border-[#BFD4E4]/60 overflow-hidden">
              <div className="px-6 py-4 bg-[#1B365D]">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Pool Rules
                </h3>
              </div>
              <div className="p-6 space-y-4">
                {[
                  "Submit your bracket before tipoff of the first game",
                  "Once locked, no changes allowed",
                  "Points increase each round to reward deep runs",
                  "Tiebreaker: most correct picks in the latest round",
                ].map((rule, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#1B365D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-[#1B365D]">{i + 1}</span>
                    </div>
                    <span className="text-sm text-[#5A7A99] leading-relaxed">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ─── */}
      <section className="py-16 bg-gradient-to-r from-[#1B365D] via-[#243F6B] to-[#1B365D] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]">
          <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)", backgroundSize: "20px 20px" }} />
        </div>
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4">
            Ready to make your picks?
          </h2>
          <p className="text-white/50 text-sm mb-8">
            The tournament starts soon. Don&apos;t get left behind.
          </p>
          <Link href="/bracket">
            <Button
              size="lg"
              className="bg-[#F4793B] hover:bg-[#E06830] text-white font-bold text-base px-10 py-6 rounded-xl shadow-lg shadow-[#F4793B]/25 hover:shadow-xl hover:shadow-[#F4793B]/30 transition-all hover:-translate-y-0.5"
            >
              Fill Out Your Bracket
            </Button>
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-8 bg-[#0F1E33]">
        <div className="mx-auto max-w-4xl px-6 flex items-center justify-center gap-3">
          <img src="/logo.png" alt="" className="h-7 w-auto rounded opacity-60" />
          <span className="text-xs text-white/30">
            Paul&apos;s Picks &mdash; March Madness 2026
          </span>
        </div>
      </footer>
    </div>
  );
}
