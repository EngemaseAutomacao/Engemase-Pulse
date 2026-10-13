import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache, cached, setCacheForTests, type KeyValueCache } from "./cache";

afterEach(() => setCacheForTests(undefined));

describe("MemoryCache", () => {
  it("expira os valores e tem trava exclusiva", async () => {
    vi.useFakeTimers();
    const cache = new MemoryCache();
    await cache.set("a", { x: 1 }, 1_000);
    expect(await cache.get("a")).toEqual({ x: 1 });
    vi.advanceTimersByTime(1_001);
    expect(await cache.get("a")).toBeNull();

    expect(await cache.acquire("lock", 5_000)).toBe(true);
    expect(await cache.acquire("lock", 5_000)).toBe(false);
    await cache.del("lock");
    expect(await cache.acquire("lock", 5_000)).toBe(true);
    vi.useRealTimers();
  });
});

describe("cached", () => {
  it("faz uma única busca para várias requisições simultâneas", async () => {
    setCacheForTests(new MemoryCache());
    const load = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true };
    });
    const results = await Promise.all(Array.from({ length: 10 }, () => cached("k", 5_000, load)));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok)).toBe(true);

    await cached("k", 5_000, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("se outra instância está buscando, espera o resultado dela em vez de buscar de novo", async () => {
    const store = new MemoryCache();
    // Simula a trava já tomada por outra instância, que grava o valor logo depois.
    const shared: KeyValueCache = {
      shared: true,
      get: (key) => store.get(key),
      set: (key, value, ttl) => store.set(key, value, ttl),
      del: (...keys) => store.del(...keys),
      acquire: async () => false,
    };
    setCacheForTests(shared);
    setTimeout(() => void store.set("k2", "da outra instância", 5_000), 50);

    const load = vi.fn(async () => "busca local");
    expect(await cached("k2", 5_000, load)).toBe("da outra instância");
    expect(load).not.toHaveBeenCalled();
  });
});
