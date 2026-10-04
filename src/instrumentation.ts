import { register as registerSimulation } from './simulation/instrumentation';

export async function register(): Promise<void> {
    await registerSimulation();

    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { scheduleKeycloakUserSync } = await import('./server/keycloakUserSync');
        scheduleKeycloakUserSync();
    }
}
