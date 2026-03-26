# PolyEconGame Codebase Summary

## Overview

PolyEconGame is a complex economic simulation game built with Next.js 15, TypeScript, and a sophisticated simulation engine. The game simulates planetary economies with detailed population dynamics, market systems, production chains, and financial systems.

## Architecture

### Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend**: tRPC for type-safe APIs, PostgreSQL with Knex.js
- **Simulation**: Worker threads with Piscina for parallel processing
- **Authentication**: Keycloak with NextAuth.js
- **State Management**: React Query (TanStack Query)
- **UI Components**: Radix UI primitives with custom shadcn/ui components
- **Testing**: Vitest (unit), Playwright (e2e)
- **Containerization**: Docker with Docker Compose

### Directory Structure and important files

```
src/
├── app/                    # Next.js App Router pages
│   ├── planets/           # Planet management UI
│   ├── agents/            # Agent/company management
│   ├── simulation/        # Simulation control panel
│   └── api/               # API routes (NextAuth, tRPC)
├── components/            # React components
│   ├── ui/               # Reusable UI components (shadcn)
│   ├── client/           # Client-side components
│   ├── navigation/       # Navigation components
│   └── icons/            # Icon components
├── hooks/                # Custom React hooks
├── lib/                  # Utility libraries
├── server/               # Backend server code
│   ├── controller/       # tRPC controllers
│   ├── db.ts            # Database connection
│   └── router.ts        # tRPC router definitions
├── simulation/           # Core simulation engine
│   ├── engine.ts        # Main simulation tick loop
│   ├── planet/          # Planet data models and logic
    |      production.ts, facilities.ts, planet.ts
│   ├── market/          # Market simulation
│   │   ├── orderBook.ts # Order book implementation
│   │   ├── matchingEngine.ts # Matching engine implementation
│   │   └── priceDiscovery.ts # Price discovery algorithms
│   ├── population/      # Population dynamics
│   │   ├── demographics.ts # Demographic calculations
│   │   ├── mortality.ts    # Mortality calculations
│   │   └── wealth.ts       # Wealth distribution calculations
│   ├── financial/       # Financial systems
│   │   ├── banking.ts    # Banking operations
│   │   ├── loans.ts      # Loan management
│   │   └── wages.ts      # Wage calculations
│   ├── workforce/       # Workforce management
│   │   ├── allocation.ts # Worker allocation algorithms
│   │   ├── training.ts   # Workforce training and education
│   │   └── productivity.ts # Productivity calculations
│   ├── worker.ts        # Worker thread implementation
│   └── workerClient/    # Worker communication
└── types/               # TypeScript type definitions
```

## Core Simulation System

### Game State Model

The simulation uses an immutable data structure for snapshots with structural sharing:

- **GameState**: Contains `tick`, `planets` (Map), `agents` (Map)
- **Planet**: Represents a celestial body with population, resources, infrastructure, environment, and bank
- **Agent**: Represents a company/player with assets, facilities, workforce, and market positions

### Simulation Tick Loop (`engine.ts`)

Each tick (30 ticks per month, 12 months per year).

#### Resource System

- **Resource Types**: Solid, liquid, gas, pieces, persons, frozen goods, land-bound, energy
- **Resource Claims**: Land and resource ownership/tenancy system
- **Renewable Resources**: Farms and water sources regenerate
- **Non-renewable Resources**: Mines have finite capacity

### Worker Thread Architecture

- **Main Thread**: Handles HTTP requests and UI rendering
- **Worker Thread**: Runs simulation in background using Piscina
- **Communication**: Message passing via MessagePort
- **Snapshot Persistence**: Periodic saving to PostgreSQL with compression
- **Crash Recovery**: Can restore from latest snapshot

## API Structure (tRPC)

All routes are defined in `src/server/router.ts` and handled in `src/server/controller/`.

## Constants & Configuration

We centralize all simulation constants in `src/simulation/constants.ts`

## Database Schema

### Key Tables

- `game_snapshots`: Compressed simulation state snapshots
- `planet_population_history`: Historical population statistics
- `user_data`: User accounts and preferences

### Migration System

- Knex.js migrations for schema evolution
- Automatic migration on dev server start, see `migrations/` directory
- Seed data for development/testing in `seeds/` directory

### Testing

```
npm run test:all
```

will, format, lint, build and run all tests. The CI pipeline runs this command on every push.

### Adding UI Components

1. Use shadcn/ui base components in `src/components/ui/`
2. Add page in `src/app/` directory
3. Use tRPC hooks for data fetching
4. Add to navigation if needed

### Debugging Simulation

1. Set `SIM_DEBUG=1` in environment
2. Check invariants in `src/simulation/invariants.ts`
3. Examine worker logs
4. Use test helpers in `src/simulation/utils/testHelper.ts`
