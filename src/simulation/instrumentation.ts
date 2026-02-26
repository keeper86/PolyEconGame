/**
 * instrumentation.ts  (Next.js server instrumentation hook)
 *
 * Executed once when the Next.js server starts (Node.js runtime only).
 * Spawns the simulation worker so it is ready before the first request.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
    // Guard: only run in the Node.js server process, not in Edge Runtime.
    if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker } = await import('./workerManager');
        startWorker();
    }
}
