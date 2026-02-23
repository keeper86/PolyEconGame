# PolyEconGame

Economy simulation as a game.

---

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Simulation Worker

### Architecture

The game uses a dedicated **Node.js `worker_thread`** to run the authoritative simulation loop.
This means the tick loop never blocks the web server or HTTP requests.

```
Next.js Server (main thread)
│
├─ instrumentation.ts  ──► startWorker()
│                                │
│                         simulation/workerManager.ts
│                                │  spawns
│                         simulation/worker.ts  ◄─── owns GameState { tick }
│                                │
│                          recursive setTimeout tick loop
│
└─ /api/ping  ──► sendToWorker({ type: "ping" })
                  ◄── onWorkerMessage({ type: "pong", tick })
```

### Files

| File | Purpose |
|------|---------|
| `simulation/worker.ts` | Worker thread: owns `GameState`, runs tick loop, handles messages |
| `simulation/workerManager.ts` | Main-thread manager: spawns worker, crash detection, graceful shutdown, typed message helpers |
| `instrumentation.ts` | Next.js server hook: calls `startWorker()` once on server startup |
| `src/app/api/ping/route.ts` | Test endpoint: sends `ping` to worker and returns current tick |

### Worker startup

`instrumentation.ts` is executed once by Next.js when the server starts (Node.js runtime only).
It imports `workerManager` and calls `startWorker()`, which spawns the worker thread.

### Communication protocol

| Direction | Message shape | Purpose |
|-----------|--------------|---------|
| main → worker | `{ type: "ping" }` | Request current tick |
| worker → main | `{ type: "pong", tick: number }` | Reply with current tick |
| worker → main | `{ type: "tick", tick: number, elapsedMs: number }` | Emitted after each tick |

### Lifecycle

- **Start** – `startWorker()` in `workerManager.ts`; idempotent (safe to call multiple times).
- **Crash detection** – if the worker exits unexpectedly, `workerManager` automatically restarts it.
- **Graceful shutdown** – `stopWorker()` terminates the worker and suppresses the restart logic.

### Testing the worker

While the server is running, call the ping endpoint:

```bash
curl http://localhost:3000/api/ping
# → {"type":"pong","tick":5}
```

Or run the automated tests:

```bash
npm test
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run Jest tests |
| `npm run lint` | Run ESLint |

