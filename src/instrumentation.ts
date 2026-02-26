/**
 * instrumentation.ts  (Next.js server instrumentation hook)
 *
 * This file must live at `src/instrumentation.ts` (or root `instrumentation.ts`)
 * so that Next.js discovers and executes it on server startup.
 *
 * Delegates to the simulation-specific registration logic.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export { register } from './simulation/instrumentation';
