import Link from "next/link";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

/** Landing page header — Log In + Features navigation. */
export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="BEE home">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <a href="#features">Features</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">Log In</Link>
          </Button>
          <Button asChild size="sm" className="bee-btn--dark">
            <Link href="/dashboard">Open the hive</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
