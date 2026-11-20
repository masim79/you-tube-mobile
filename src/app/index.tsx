import React from "react";

import { LoadingState } from "../ui/LoadingState";

/**
 * Never actually shown in normal use — `_layout.tsx`'s `Bootstrap`
 * replaces the route before this would render. Exists only as a safe
 * fallback for "/" itself (e.g. a stray deep link) instead of a
 * router "no route matched" error.
 */
export default function IndexFallback() {
  return <LoadingState />;
}
