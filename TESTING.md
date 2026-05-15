# Testing — Spritz Chat

## Quick start

```bash
npm test              # run all unit/integration tests (Vitest)
npm run test:watch    # watch mode
npm run test:coverage # with V8 coverage report
npm run test:e2e      # Playwright E2E (starts dev server if needed)
npm run test:e2e:ui   # Playwright UI mode
```

## Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Unit + integration test runner |
| **React Testing Library** | Component rendering + queries |
| **happy-dom** | Lightweight browser environment |
| **MSW** | Network request mocking (API stubs) |
| **@vitest/coverage-v8** | Code coverage (V8-based) |
| **Playwright** | End-to-end browser tests |

## File layout

```
tests/
├── setup.ts                    # Vitest global setup (DOM stubs, polyfills)
├── mocks/
│   ├── handlers.ts             # MSW request handlers (default stubs)
│   └── server.ts               # MSW server instance
├── smoke/                      # Smoke tests — regression tripwires
│   ├── session-refresh.test.ts # Auth session refresh logic
│   ├── auth-storage.test.ts    # Credential storage + expiry
│   ├── address-utils.test.ts   # Wallet address normalization
│   ├── pwa-manifest.test.ts    # Manifest installability checks
│   ├── sw-config.test.ts       # Service worker caching rules
│   └── components.test.tsx     # Basic component rendering
├── unit/                       # Focused unit tests (legacy)
│   └── sessionRefresh.test.ts  # Original manual test (runs via npx tsx)
└── e2e/
    ├── smoke.spec.ts           # Unauthenticated E2E smoke
    └── flows/
        └── chat-session-persistence.spec.ts  # Auth persistence E2E (needs fixtures)
```

## Conventions

### Where tests live

- **Unit tests** for `src/lib/*.ts` and `src/utils/*.ts`: place in `tests/smoke/` or co-locate as `*.test.ts` next to the source file.
- **Component tests**: `tests/smoke/` for smoke-level, or `src/components/__tests__/` for focused component tests.
- **API route tests**: `tests/api/` (future).
- **E2E tests**: `tests/e2e/`.

### Naming

- `*.test.ts` / `*.test.tsx` for Vitest tests.
- `*.spec.ts` for Playwright E2E tests.

### What to test

**Always test:**
- Auth flows (session refresh, credential storage, expiry detection)
- API route input validation and error responses
- Pure utility functions (address normalization, date formatting, sanitization)
- PWA installability (manifest, SW config, caching rules)
- Component rendering of critical UI (chat list, message display)

**Skip (for now):**
- Pixel-perfect layout assertions (too brittle)
- Third-party SDK internals (Waku, Huddle01, Agora)
- Full integration through WebRTC/P2P paths

### MSW usage

Import the server from `tests/mocks/server.ts` and use `server.use()` to override default handlers per test:

```typescript
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("handles API error", async () => {
  server.use(
    http.get("/api/example", () =>
      HttpResponse.json({ error: "fail" }, { status: 500 })
    )
  );
  // ... test code
});
```

## Coverage

Coverage is generated to `./coverage/` (gitignored). We do **not** chase 100%. Target meaningful coverage of critical paths:

- Auth + session management
- Message send/receive logic
- Address normalization
- API route validation
- PWA configuration correctness
