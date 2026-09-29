import { spawn, type ChildProcess } from "node:child_process";

const targets = ["pages", "background", "content"];

const children: ChildProcess[] = targets.map((target) =>
  spawn("vite", ["build", "--watch"], {
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: target },
    shell: false,
  }),
);

console.log(`[extension] watching ${targets.join(", ")}`);

const shutdown = (): void => {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
