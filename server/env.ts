import { join } from 'node:path';
import dotenv from 'dotenv';

/** Load `.env.local` then `.env` from `cwd`. Earlier files win; real env vars win over both. */
export function loadEnv(cwd: string = process.cwd()): void {
  dotenv.config({ path: [join(cwd, '.env.local'), join(cwd, '.env')], quiet: true });
}
