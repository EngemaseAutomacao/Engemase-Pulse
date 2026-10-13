import { describe, expect, it } from "vitest";
import { hasTenantRole, homePathFor, roleInTenant, type AuthUser } from "./permissions";

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  email: "a@b.com",
  name: "A",
  isPlatformAdmin: false,
  memberships: [{ tenantId: "t1", tenantSlug: "acme", tenantName: "Acme", role: "OPERATOR" }],
  ...overrides,
});

describe("permissões por cliente", () => {
  it("respeita a hierarquia de papéis", () => {
    expect(hasTenantRole(user(), "t1", "VIEWER")).toBe(true);
    expect(hasTenantRole(user(), "t1", "OPERATOR")).toBe(true);
    expect(hasTenantRole(user(), "t1", "ADMIN")).toBe(false);
  });

  it("sem vínculo não acessa; administrador da plataforma acessa tudo", () => {
    expect(roleInTenant(user(), "t2")).toBeNull();
    expect(hasTenantRole(user({ isPlatformAdmin: true, memberships: [] }), "t2", "ADMIN")).toBe(true);
  });
});

describe("homePathFor", () => {
  it("leva cada perfil para o lugar certo", () => {
    expect(homePathFor(user())).toBe("/app/acme");
    expect(homePathFor(user({ isPlatformAdmin: true }))).toBe("/admin");
    expect(homePathFor(user({ memberships: [] }))).toBe("/app");
  });
});
