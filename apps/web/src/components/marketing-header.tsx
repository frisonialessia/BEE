import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Public marketing header — Log In + Features only. */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 bg-[var(--color-background)]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="BEE home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="#features">Features</a>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard">Log In</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
