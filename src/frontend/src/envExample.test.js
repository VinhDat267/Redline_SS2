import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const frontendEnvExamplePath = resolve(process.cwd(), ".env.example");

describe("frontend .env.example", () => {
  test("documents the contract chat streaming kill switch", () => {
    const envExample = readFileSync(frontendEnvExamplePath, "utf-8");

    expect(envExample).toContain("VITE_CONTRACT_CHAT_STREAMING_ENABLED=true");
  });
});
