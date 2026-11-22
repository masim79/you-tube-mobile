#!/usr/bin/env node
// Initializes vendor/you-tube as a shallow, sparse checkout: only the two
// paths mobile actually consumes (contracts/openapi.yaml for gen:api,
// frontend/src/styles/themes/*.css for gen:tokens), not the full you-tube
// repo (backend/, nginx/, docker/, etc.) or its full commit history.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

console.log("Setting up vendor/you-tube (shallow + sparse)...");
run("git submodule update --init --depth 1");
run("git -C vendor/you-tube sparse-checkout init --cone");
run(
  "git -C vendor/you-tube sparse-checkout set contracts frontend/src/styles/themes",
);
console.log(
  "Done. vendor/you-tube now contains only contracts/ and frontend/src/styles/themes/.",
);
