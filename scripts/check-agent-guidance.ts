import { readFile } from "node:fs/promises";

const guidanceFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".codex/skills/gc-medi-eye-reservation/SKILL.md",
  ".claude/skills/gc-medi-eye-reservation/SKILL.md",
] as const;

const requiredConcepts = [
  "screening_seats.reservation_id",
  "Idempotency-Key",
  "READ COMMITTED",
  "seat_id",
  "guarded",
  "/api/v1",
  "@PublicRoute()",
  "pnpm build",
  "pnpm lint",
  "pnpm test",
] as const;

const forbiddenConcepts = ["docs/adr/", "Keep long alternatives"] as const;

const main = async (): Promise<void> => {
  const documents = await Promise.all(
    guidanceFiles.map(async (path) => ({
      path,
      contents: await readFile(path, "utf8"),
    })),
  );

  const problems = documents.flatMap(({ path, contents }) => [
    ...requiredConcepts
      .filter((concept) => !contents.includes(concept))
      .map((concept) => `${path}: missing required concept: ${concept}`),
    ...forbiddenConcepts
      .filter((concept) => contents.includes(concept))
      .map((concept) => `${path}: contains removed workflow: ${concept}`),
  ]);

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }

  console.log(
    `Guidance is aligned across ${guidanceFiles.length} entry points.`,
  );
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
