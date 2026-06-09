export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startWorker } = await import('./workerClient/manager');
        startWorker();
    }
}
