import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache, setCacheForTests } from "@/server/cache";

// ---------------------------------------------------------------------------
// Banco, cadastro, leituras e push simulados: o teste observa quando o
// avaliador toca no banco.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const state = { kw: 400 };
  const db = {
    tenant: {
      findMany: vi.fn(async () => [{ id: "t1" }]),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "t1",
        slug: "acme",
        name: "Acme",
        active: true,
        alarmRules: [
          {
            id: "r1",
            name: "Demanda alta",
            meterId: null,
            kind: "THRESHOLD",
            field: "Total_kW",
            comparison: "ABOVE",
            threshold: 300,
            severity: "CRITICAL",
          },
        ],
        alarms: [],
      })),
    },
    alarm: {
      createManyAndReturn: vi.fn(async ({ data }: { data: { openKey: string; ruleId: string; meterId: string }[] }) =>
        data.map((row, i) => ({ ...row, id: `a${i + 1}`, severity: "CRITICAL", title: "x", message: "y" })),
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
    },
    membership: {
      findMany: vi.fn(async () => [
        { userId: "u1", alarmEmail: false, user: { email: "u1@example.com", telegramChatId: null } },
      ]),
    },
    session: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
  return { state, db, push: vi.fn(async () => ({ sent: 1, failed: 0 })) };
});

vi.mock("@/server/db", () => ({ db: mocks.db }));
vi.mock("@/server/push", () => ({ sendPushToUsers: mocks.push }));
vi.mock("@/server/telemetry/topology", () => ({
  getTenantTopology: async () => [
    {
      id: "s1",
      name: "Matriz",
      meters: [{ id: "m1", tag: "MM-01", name: "Entrada", siteId: "s1", isMain: true, breakerAmps: null }],
    },
  ],
}));
vi.mock("@/server/telemetry/live", () => ({
  getSiteLive: async () => ({
    readings: { m1: { time: new Date().toISOString(), values: { Total_kW: mocks.state.kw } } },
    error: null,
    fetchedAt: new Date().toISOString(),
  }),
}));

const { evaluateAllTenants } = await import("./engine");

function dbWrites() {
  return mocks.db.alarm.createManyAndReturn.mock.calls.length + mocks.db.alarm.updateMany.mock.calls.length;
}

describe("avaliador de alarmes", () => {
  beforeEach(() => {
    setCacheForTests(new MemoryCache());
    vi.clearAllMocks();
    mocks.state.kw = 400;
  });

  it("abre o alarme uma vez e notifica", async () => {
    const result = await evaluateAllTenants();
    expect(result).toMatchObject({ tenants: 1, evaluated: 1, opened: 1, notified: 1 });
    expect(mocks.db.alarm.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mocks.db.alarm.createManyAndReturn.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("enquanto nada muda, não consulta nem grava no banco", async () => {
    await evaluateAllTenants();
    const readsAfterFirstRun = mocks.db.tenant.findMany.mock.calls.length + mocks.db.tenant.findUniqueOrThrow.mock.calls.length;
    const writesAfterFirstRun = dbWrites();

    await evaluateAllTenants();
    await evaluateAllTenants();

    expect(mocks.db.tenant.findMany.mock.calls.length + mocks.db.tenant.findUniqueOrThrow.mock.calls.length).toBe(readsAfterFirstRun);
    expect(dbWrites()).toBe(writesAfterFirstRun);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("normaliza quando o valor volta ao normal", async () => {
    await evaluateAllTenants();
    mocks.state.kw = 200;
    const result = await evaluateAllTenants();
    expect(result.cleared).toBe(1);
    expect(mocks.db.alarm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ openKey: null }) }),
    );
  });

  it("não roda duas avaliações ao mesmo tempo", async () => {
    const [a, b] = await Promise.all([evaluateAllTenants(), evaluateAllTenants()]);
    expect([a.skippedBecauseRunning, b.skippedBecauseRunning].filter(Boolean)).toHaveLength(1);
    expect(mocks.db.alarm.createManyAndReturn).toHaveBeenCalledTimes(1);
  });
});
