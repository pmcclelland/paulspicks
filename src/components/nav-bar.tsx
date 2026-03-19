"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function NavBar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-[#0F1E33]/95 backdrop-blur-md border-b border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <img
                src="/logo.png"
                alt="Paul's Picks"
                className="h-11 w-auto rounded-lg shadow-md group-hover:shadow-lg transition-shadow"
              />
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-base font-extrabold text-white tracking-tight">
                Paul&apos;s Picks
              </span>
              <span className="text-[11px] font-bold text-[#F4793B] uppercase tracking-[0.15em]">
                March Madness 2026
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-1">
            {[
              { href: "/bracket", label: "Bracket" },
              { href: "/scores", label: "Scores" },
              { href: "/leaderboard", label: "Leaderboard" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative px-4 py-2 text-sm font-semibold text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]"
              >
                {link.label}
              </Link>
            ))}

            <div className="w-px h-6 bg-white/10 mx-2" />

            {session?.user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#F4793B]/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#F4793B]">
                      {session.user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-white/70">
                    {session.user.name}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="bg-white/[0.08] hover:bg-white/[0.14] text-white/70 hover:text-white border-0 text-xs"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button
                    size="sm"
                    className="bg-transparent hover:bg-white/[0.06] text-white/70 hover:text-white border-0 text-sm font-semibold"
                  >
                    Log In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button
                    size="sm"
                    className="bg-[#F4793B] hover:bg-[#E06830] text-white font-semibold shadow-md shadow-[#F4793B]/20"
                  >
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#0F1E33]/98 backdrop-blur-md">
          <div className="px-4 py-3 space-y-1">
            {[
              { href: "/bracket", label: "Bracket" },
              { href: "/scores", label: "Scores" },
              { href: "/leaderboard", label: "Leaderboard" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 mt-2 border-t border-white/[0.06]">
              {session?.user ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2">
                    <div className="w-7 h-7 rounded-full bg-[#F4793B]/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-[#F4793B]">
                        {session.user.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm text-white/60">{session.user.name}</span>
                  </div>
                  <button
                    className="block w-full text-left rounded-lg px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white"
                    onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <div className="flex gap-2 px-4 py-2">
                  <Link href="/login" className="flex-1" onClick={() => setMenuOpen(false)}>
                    <Button size="sm" className="w-full bg-white/[0.08] hover:bg-white/[0.14] text-white border-0">
                      Log In
                    </Button>
                  </Link>
                  <Link href="/register" className="flex-1" onClick={() => setMenuOpen(false)}>
                    <Button size="sm" className="w-full bg-[#F4793B] hover:bg-[#E06830] text-white font-semibold">
                      Sign Up
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
