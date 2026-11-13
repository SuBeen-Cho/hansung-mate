import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [command] = process.argv.slice(2);
if (!command || !["validate", "generate"].includes(command)) {
  throw new Error("사용법: node scripts/run-prisma.mjs <validate|generate>");
}

const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (major === 25) {
  console.error("Prisma는 Node 25를 지원하지 않습니다. .node-version의 Node 24로 실행하세요.");
  process.exit(2);
}

const prismaEntry = resolve("node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaEntry, command], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
