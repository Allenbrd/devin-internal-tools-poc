import { setupDatabase } from "../../scripts/db-setup";

export default async function globalSetup() {
  await setupDatabase({ reset: true, seed: true });
}
