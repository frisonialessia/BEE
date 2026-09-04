"use client";

import { NetworkNavigatorPanel } from "@/components/network-navigator";

/** Red — who you know before you knock: the relationship map, the
 *  strongest connectors, warm-intro paths to a target account. The page
 *  shell, its four numbers and every box live in NetworkNavigatorPanel,
 *  which owns the data. */
export function NetworkView() {
  return <NetworkNavigatorPanel />;
}
