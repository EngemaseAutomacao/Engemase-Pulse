import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Cache de curta duração compartilhado.
 *
 * - Com Upstash Redis configurado (UPSTASH_REDIS_REST_* ou KV_REST_API_*, criadas
 *   pela integração da Vercel), todas as instâncias do servidor dividem o mesmo cache.
 * - Sem Redis, usa memória da própria instância — ainda ajuda, pois na Vercel uma
 *   instância atende várias requisições.
 *
 * Falhas do Redis nunca derrubam a aplicação: viram "cache miss" e a busca segue direto.
 */

export interface KeyValueCache {
  /** true quando o cache é dividido entre instâncias (Redis). */
  readonly shared: boolean;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Trava curta para que só uma instância busque o dado; true se conseguiu. */
  acquire(key: string, ttlMs: number): Promise<boolean>;
}

const MEMORY_MAX_ENTRIES = 5_000;

export class MemoryCache implements KeyValueCache {
  readonly shared = false;
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    if (this.entries.size >= MEMORY_MAX_ENTRIES) {
      // Remove a entrada mais antiga (Map preserva a ordem de inserção).
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    // Verificar e gravar sem nenhum await no meio: é o que torna a trava atômica.
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > Date.now()) return false;
    this.entries.set(key, { value: 1, expiresAt: Date.now() + ttlMs });
    return true;
  }
}

class RedisCache implements KeyValueCache {
  readonly shared = true;
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    return safely(() => this.redis.get<T>(key), null);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await safely(() => this.redis.set(key, value, { px: ttlMs }), null);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await safely(() => this.redis.del(...keys), 0);
  }

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    return (await safely(() => this.redis.set(key, "1", { nx: true, px: ttlMs }), "OK")) === "OK";
  }
}

async function safely<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Fim de um pré-render do Next: ele cancela as buscas pendentes de propósito; não é falha do Redis.
    if (!isPrerenderCancel(error)) {
      console.error("[cache] Redis indisponível:", error instanceof Error ? error.message : error);
    }
    return fallback;
  }
}

function isPrerenderCancel(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { digest?: unknown }).digest === "HANGING_PROMISE_REJECTION";
}

// No globalThis: o Next pode carregar cópias deste módulo em pacotes diferentes
// (rotas de API x páginas) no mesmo processo, e todas devem ver o mesmo cache.
const globalCache = globalThis as unknown as {
  __appCache?: KeyValueCache;
  __appCacheInflight?: Map<string, Promise<unknown>>;
};

export function getCache(): KeyValueCache {
  if (globalCache.__appCache) return globalCache.__appCache;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  globalCache.__appCache = url && token ? new RedisCache(new Redis({ url, token })) : new MemoryCache();
  return globalCache.__appCache;
}

/** Só para testes. */
export function setCacheForTests(cache: KeyValueCache | undefined) {
  globalCache.__appCache = cache;
}

/**
 * Validade de dados de cadastro em cache. Com Redis as alterações invalidam o
 * cache na hora (para todas as instâncias), então pode durar mais; em memória,
 * outras instâncias só veem a mudança quando expira — por isso é curto.
 */
export function configTtlMs(): number {
  return getCache().shared ? 30 * 60_000 : 30_000;
}

// ---------------------------------------------------------------------------

const inflight = (globalCache.__appCacheInflight ??= new Map<string, Promise<unknown>>());
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Devolve o valor em cache ou o carrega uma única vez:
 *  - requisições simultâneas na mesma instância compartilham a mesma busca;
 *  - entre instâncias, uma trava curta faz as demais esperarem o resultado
 *    da primeira em vez de consultarem a fonte ao mesmo tempo.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const cache = getCache();
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const task = (async () => {
    const owner = await cache.acquire(`lock:${key}`, Math.max(ttlMs, 5_000));
    if (!owner) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await sleep(150);
        const value = await cache.get<T>(key);
        if (value !== null) return value;
      }
    }
    const value = await load();
    await cache.set(key, value, ttlMs);
    if (owner) await cache.del(`lock:${key}`);
    return value;
  })().finally(() => inflight.delete(key));

  inflight.set(key, task);
  return task;
}
