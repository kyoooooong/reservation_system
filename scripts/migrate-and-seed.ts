import { migrate } from "./migrate";
import { seed } from "./seed";

async function main(): Promise<void> {
  await migrate();
  await seed();
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
