import { describe, expect, it, vi } from 'vitest';
import { COMMERCIAL_LICENSE_COST, WORKFORCE_LICENSE_COST } from '../constants';
import { checkMonetaryConservation } from '../invariants';
import { totalOutstandingLoans } from '../financial/loanTypes';
import { makeWorld } from '../utils/testHelper';
import type { OutboundMessage } from './messages';
import { handleAcquireLicense } from './licenseActions';

function makeMessages() {
    const messages: OutboundMessage[] = [];
    const post = vi.fn((msg: OutboundMessage) => messages.push(msg));
    return { messages, post };
}

function setupWorld() {
    const world = makeWorld({ companyIds: ['company-1'] });
    const { gameState, planet, gov, agents } = world;
    const company = agents.find((a) => a.id === 'company-1')!;
    return { gameState, planet, gov, company };
}

describe('handleAcquireLicense — new planet (no prior assets)', () => {
    it('acquires commercial license and creates an initial loan', () => {
        const { gameState, planet, company } = setupWorld();
        // Remove existing assets so this is a "new planet" scenario
        delete company.assets[planet.id];
        const bankLoansBefore = planet.bank.loans;
        const bankDepositsBefore = planet.bank.deposits;
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r1',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({ type: 'licenseAcquired', licenseType: 'commercial' });

        const assets = company.assets[planet.id]!;
        expect(assets.licenses.commercial).toBeDefined();
        expect(assets.licenses.commercial!.frozen).toBe(false);
        // workforce license must NOT be auto-granted
        expect(assets.licenses.workforce).toBeUndefined();

        // initial loan created
        expect(totalOutstandingLoans(assets.activeLoans)).toBe(COMMERCIAL_LICENSE_COST);
        expect(assets.deposits).toBe(0);
        expect(planet.bank.loans).toBe(bankLoansBefore + COMMERCIAL_LICENSE_COST);
        expect(planet.bank.deposits).toBe(bankDepositsBefore + COMMERCIAL_LICENSE_COST);
    });

    it('credits the government agent with the license fee', () => {
        const { gameState, planet, gov, company } = setupWorld();
        delete company.assets[planet.id];
        const govDepositsBefore = gov.assets[planet.id]!.deposits;
        const { post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r3',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        expect(gov.assets[planet.id]!.deposits).toBe(govDepositsBefore + COMMERCIAL_LICENSE_COST);
    });
});

describe('handleAcquireLicense — existing planet assets', () => {
    it('deducts cost from deposits when agent already has assets on the planet', () => {
        const { gameState, planet, company } = setupWorld();
        company.assets[planet.id]!.deposits = 200_000;
        // Remove commercial license first so we can acquire it
        delete company.assets[planet.id]!.licenses.commercial;
        const bankDepositsBefore = planet.bank.deposits;
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r4',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquired', licenseType: 'commercial' });
        expect(company.assets[planet.id]!.deposits).toBe(200_000 - COMMERCIAL_LICENSE_COST);
        // bank.deposits must not change: agent paid cost, gov received cost — net zero per monetary invariant
        expect(planet.bank.deposits).toBe(bankDepositsBefore);
    });

    it('acquires workforce license independently from commercial', () => {
        const { gameState, planet, company } = setupWorld();
        company.assets[planet.id]!.deposits = 200_000;
        delete company.assets[planet.id]!.licenses.workforce;
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r5',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'workforce',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquired', licenseType: 'workforce' });
        expect(company.assets[planet.id]!.deposits).toBe(200_000 - WORKFORCE_LICENSE_COST);
    });

    it('refuses acquisition when deposits are insufficient', () => {
        const { gameState, planet, company } = setupWorld();
        company.assets[planet.id]!.deposits = 1000;
        delete company.assets[planet.id]!.licenses.commercial;
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r6',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquisitionFailed' });
        expect(company.assets[planet.id]!.licenses.commercial).toBeUndefined();
        expect(company.assets[planet.id]!.deposits).toBe(1000); // unchanged
    });
});

describe('handleAcquireLicense — duplicate prevention', () => {
    it('rejects a duplicate commercial license and does NOT double-grant', () => {
        const { gameState, planet, company } = setupWorld();
        // company already has commercial license from makeWorld
        const licensesBefore = { ...company.assets[planet.id]!.licenses };
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r7',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquisitionFailed' });
        // License state unchanged
        expect(company.assets[planet.id]!.licenses).toEqual(licensesBefore);
    });

    it('rejects a duplicate workforce license and does NOT double-grant', () => {
        const { gameState, planet, company } = setupWorld();
        const licensesBefore = { ...company.assets[planet.id]!.licenses };
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r8',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'workforce',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquisitionFailed' });
        expect(company.assets[planet.id]!.licenses).toEqual(licensesBefore);
    });
});

describe('handleAcquireLicense — monetary invariants', () => {
    it('preserves monetary conservation when bootstrapping a commercial license via initial loan', () => {
        const { gameState, planet, company } = setupWorld();
        delete company.assets[planet.id];
        const { post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'inv1',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets);
        expect(discrepancies).toHaveLength(0);
    });

    it('preserves monetary conservation when paying for a commercial license from existing deposits', () => {
        const { gameState, planet, company } = setupWorld();
        company.assets[planet.id]!.deposits = 200_000;
        planet.bank.deposits = 200_000; // balance bank to match agent deposits
        planet.bank.loans = 200_000; // balance sheet: deposits = loans
        delete company.assets[planet.id]!.licenses.commercial;
        const { post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'inv2',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets);
        expect(discrepancies).toHaveLength(0);
    });

    it('preserves monetary conservation when paying for a workforce license from existing deposits', () => {
        const { gameState, planet, company } = setupWorld();
        company.assets[planet.id]!.deposits = 200_000;
        planet.bank.deposits = 200_000; // balance bank to match agent deposits
        planet.bank.loans = 200_000; // balance sheet: deposits = loans
        delete company.assets[planet.id]!.licenses.workforce;
        const { post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'inv3',
                agentId: company.id,
                planetId: planet.id,
                licenseType: 'workforce',
            },
            post,
        );

        const discrepancies = checkMonetaryConservation(gameState.agents, gameState.planets);
        expect(discrepancies).toHaveLength(0);
    });
});

describe('handleAcquireLicense — invalid inputs', () => {
    it('fails with unknown agent id', () => {
        const { gameState, planet } = setupWorld();
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r9',
                agentId: 'no-such-agent',
                planetId: planet.id,
                licenseType: 'commercial',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquisitionFailed' });
    });

    it('fails with unknown planet id', () => {
        const { gameState, company } = setupWorld();
        const { messages, post } = makeMessages();

        handleAcquireLicense(
            gameState,
            {
                type: 'acquireLicense',
                requestId: 'r10',
                agentId: company.id,
                planetId: 'no-such-planet',
                licenseType: 'commercial',
            },
            post,
        );

        expect(messages[0]).toMatchObject({ type: 'licenseAcquisitionFailed' });
    });
});
