import React from "react";

import { Bootstrap } from "../navigation/Bootstrap";
import { AuthProvider } from "../store/AuthContext";
import { ServerProvider } from "../store/ServerContext";
import { ThemeProvider } from "../theme/ThemeProvider";

/**
 * Provider order matters: `AuthProvider` reads `useServer()`, so
 * `ServerProvider` must be the outer one. `Bootstrap` (inside both)
 * decides the first route on every launch (PLAN.md §17.6, Gate M-A).
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <ServerProvider>
        <AuthProvider>
          <Bootstrap />
        </AuthProvider>
      </ServerProvider>
    </ThemeProvider>
  );
}
