import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const outputPath = process.argv[2] ?? "tmp/reservation-system-submission.zip";

const run = (
  command: string,
  args: string[],
  input?: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });

    child.stdin.end(input);
  });

const main = async (): Promise<void> => {
  const listed = await run("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  const files = listed
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  if (files.length === 0) {
    throw new Error("No submission files found.");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  await run("zip", ["-q", outputPath, "-@"], `${files.join("\n")}\n`);

  console.log(`Created ${outputPath} with ${files.length} files.`);
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
