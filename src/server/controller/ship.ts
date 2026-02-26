import { z } from 'zod';
import { procedure } from '../trpcRoot';
import { startWorker, sendToWorker } from '../../simulation/workerManager';

export const ship = () => {
    return procedure
        .input(
            z.object({
                from: z.string(),
                to: z.string(),
                cargo: z.object({
                    metal: z.number(),
                    energy: z.number().optional(),
                }),
                eta: z.number().optional(),
            }),
        )
        .output(
            z.object({
                ok: z.boolean(),
            }),
        )
        .mutation(async ({ input }) => {
            // ensure worker is running then send the job
            startWorker();

            sendToWorker({
                type: 'createShip',
                from: input.from,
                to: input.to,
                cargo: { metal: Number(input.cargo.metal) || 0, energy: Number(input.cargo.energy) || 0 },
                eta: input.eta,
            });

            return { ok: true };
        });
};
