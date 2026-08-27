import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import {
  allPermissions,
  rolePermissions,
} from "../src/modules/permissions/permissions.catalog.js";
import { hashToken } from "../src/shared/auth-tokens.js";
import { pdfService } from "../src/shared/pdf.service.js";

const password = "123456";
let catalogSequence = 1;

const binaryParser = (
  res: any,
  callback: (error: Error | null, body: any) => void,
) => {
  const chunks: Buffer[] = [];

  res.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "binary"));
  });

  res.on("end", () => {
    callback(null, Buffer.concat(chunks));
  });

  res.on("error", (error: Error) => {
    callback(error, null);
  });
};

type TestUser = {
  id: string;
  email: string;
  role: "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA";
};

async function resetDatabase() {
  // Keep reset sequential to avoid lock/ordering issues with the pg adapter.
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.userPermissionOverride.deleteMany();
  await prisma.notificationDismissal.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.financialDocument.deleteMany();
  await prisma.commitmentNote.deleteMany();
  await prisma.ataItemBalanceMovement.deleteMany();
  await prisma.serviceOrderDeliveredDocument.deleteMany();
  await prisma.serviceOrderScheduleItem.deleteMany();
  await prisma.serviceOrderItem.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.diexRequestItem.deleteMany();
  await prisma.diexRequest.deleteMany();
  await prisma.estimateItem.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.taskActivity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.ataItem.deleteMany();
  await prisma.ataCoverageLocality.deleteMany();
  await prisma.ataCoverageGroup.deleteMany();
  await prisma.ata.deleteMany();
  await prisma.pregao.deleteMany();
  await prisma.militaryOrganization.deleteMany();
  await prisma.integrationConnectionCheck.deleteMany();
  await prisma.systemConfiguration.deleteMany();
  await prisma.user.deleteMany();
  await prisma.permission.deleteMany();
}

async function seedPermissionsMatrix() {
  for (const code of allPermissions) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }

  for (const [role, permissions] of Object.entries(rolePermissions)) {
    for (const code of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
        select: { id: true },
      });

      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: {
            role: role as "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA",
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          id: `role:${role}:${code}`,
          role: role as "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA",
          permissionId: permission.id,
        },
      });
    }
  }
}

async function createUser(
  email: string,
  role: TestUser["role"],
  name = role,
): Promise<TestUser> {
  const passwordHash = await bcrypt.hash(password, 4);
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      active: true,
      rank: "2º Ten",
      cpf: "11122233344",
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });
}

async function denyPermissionsForUser(userId: string, permissionCodes: string[]) {
  const permissions = await prisma.permission.findMany({
    where: {
      code: {
        in: permissionCodes,
      },
    },
    select: {
      id: true,
      code: true,
    },
  });

  expect(permissions).toHaveLength(permissionCodes.length);

  await Promise.all(
    permissions.map((permission) =>
      prisma.userPermissionOverride.upsert({
        where: {
          userId_permissionId: {
            userId,
            permissionId: permission.id,
          },
        },
        update: {
          effect: "DENY",
        },
        create: {
          id: `override:${userId}:${permission.id}`,
          userId,
          permissionId: permission.id,
          effect: "DENY",
        },
      }),
    ),
  );
}

async function login(email: string, userAgent?: string) {
  const requestBuilder = request(app).post("/api/auth/login");

  if (userAgent) {
    requestBuilder.set("User-Agent", userAgent);
  }

  const response = await requestBuilder.send({ email, password }).expect(200);
  expect(response.body.refreshToken).toBeUndefined();
  expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
  expect(response.headers["set-cookie"]?.[0]).toContain("Path=/api/auth");
  const refreshCookie = response.headers["set-cookie"]?.[0]?.split(";")[0];
  if (!refreshCookie) throw new Error("Cookie de renovação não recebido no login");
  const refreshToken = decodeURIComponent(refreshCookie.slice(refreshCookie.indexOf("=") + 1));

  return {
    ...response.body,
    refreshCookie,
    refreshToken,
  } as {
    accessToken: string;
    refreshToken: string;
    refreshCookie: string;
    user: {
      id: string;
      role: string;
      permissions: string[];
      access: { role: string; permissions: string[]; isAdmin: boolean };
    };
  };
}

async function createCatalog(initialQuantity = "1000.00") {
  const sequence = catalogSequence++;
  const ata = await prisma.ata.create({
    data: {
      number: `ATA-TESTE-${String(sequence).padStart(3, "0")}`,
      type: "CFTV",
      vendorName: "Fornecedor Teste",
    },
  });
  const coverageGroup = await prisma.ataCoverageGroup.create({
    data: {
      ataId: ata.id,
      code: "AM",
      name: "Amazonas",
    },
  });
  await prisma.ataCoverageLocality.create({
    data: {
      coverageGroupId: coverageGroup.id,
      cityName: "Manaus",
      stateUf: "AM",
    },
  });
  const ataItem = await prisma.ataItem.create({
    data: {
      ataId: ata.id,
      coverageGroupId: coverageGroup.id,
      referenceCode: "ITEM-001",
      description: "Camera IP",
      unit: "UN",
      unitPrice: "100.00",
      initialQuantity,
    },
  });
  const om = await prisma.militaryOrganization.create({
    data: {
      sigla: `OMT${sequence}`,
      name: `Organizacao Militar Teste ${sequence}`,
      cityName: "Manaus",
      stateUf: "AM",
      isActive: true,
    },
  });

  return { ata, coverageGroup, ataItem, om };
}

async function createProject(
  token: string,
  title = "Projeto CFTV Manaus",
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, description: "Projeto de teste", ...overrides })
    .expect(201);

  return response.body as { id: string; projectCode: number; title: string };
}

async function seedFinalizedEstimate(projectId: string) {
  const catalog = await createCatalog();
  const estimate = await prisma.estimate.create({
    data: {
      projectId,
      ataId: catalog.ata.id,
      coverageGroupId: catalog.coverageGroup.id,
      omId: catalog.om.id,
      status: "FINALIZADA",
      omName: catalog.om.sigla,
      destinationCityName: catalog.om.cityName,
      destinationStateUf: catalog.om.stateUf,
      totalAmount: "200.00",
      items: {
        create: {
          ataItemId: catalog.ataItem.id,
          referenceCode: catalog.ataItem.referenceCode,
          description: catalog.ataItem.description,
          unit: catalog.ataItem.unit,
          quantity: "2.00",
          unitPrice: catalog.ataItem.unitPrice,
          subtotal: "200.00",
        },
      },
    },
  });

  return { estimate, ...catalog };
}

async function seedFinalizedEstimateWithBalance(
  projectId: string,
  {
    initialQuantity = "1000.00",
    quantity = "2.00",
  }: {
    initialQuantity?: string;
    quantity?: string;
  } = {},
) {
  const catalog = await createCatalog(initialQuantity);
  const totalAmount = (Number(quantity) * Number(catalog.ataItem.unitPrice)).toFixed(2);
  const estimate = await prisma.estimate.create({
    data: {
      projectId,
      ataId: catalog.ata.id,
      coverageGroupId: catalog.coverageGroup.id,
      omId: catalog.om.id,
      status: "FINALIZADA",
      omName: catalog.om.sigla,
      destinationCityName: catalog.om.cityName,
      destinationStateUf: catalog.om.stateUf,
      totalAmount,
      items: {
        create: {
          ataItemId: catalog.ataItem.id,
          referenceCode: catalog.ataItem.referenceCode,
          description: catalog.ataItem.description,
          unit: catalog.ataItem.unit,
          quantity,
          unitPrice: catalog.ataItem.unitPrice,
          subtotal: totalAmount,
        },
      },
    },
  });

  return { estimate, ...catalog };
}

async function createProjectWithFinalizedEstimate(token: string, p0?: string) {
  const project = await createProject(token);
  const seeded = await seedFinalizedEstimate(project.id);
  return { project, ...seeded };
}

async function moveToCreditNote(projectId: string, token: string) {
  await request(app)
    .patch(`/api/projects/${projectId}/flow`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      stage: "AGUARDANDO_NOTA_CREDITO",
    })
    .expect(200);
}

async function issueDiex(projectId: string, estimateId: string, token: string) {
  const response = await request(app)
    .post("/api/diex")
    .set("Authorization", `Bearer ${token}`)
    .send({
      projectId,
      estimateId,
      diexNumber: "DIEX-001",
      issuedAt: "2026-04-01T00:00:00.000Z",
      supplierCnpj: "12345678000190",
      requesterName: "Requisitante Teste",
      requesterRank: "2 Ten",
      requesterCpf: "11122233344",
    })
    .expect(201);

  return response.body as { id: string; diexCode: number; diexNumber: string };
}

async function registerSignedServiceOrder(projectId: string, token: string) {
  const response = await request(app)
    .patch(`/api/projects/${projectId}/service-order/signature`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      signedServiceOrderLink: "https://drive.example.mil.br/os/assinada.pdf",
      signedServiceOrderReceivedAt: "2026-04-03T12:00:00.000Z",
      signedServiceOrderNotes: "Documento devolvido pela contratada.",
    })
    .expect(200);

  expect(response.body.stage).toBe("AGUARDANDO_INICIO_EXECUCAO");
  expect(response.body.signedServiceOrderLink).toContain("assinada.pdf");
  return response.body;
}

async function setProjectAndEstimateCreatedAt(
  projectId: string,
  estimateId: string,
  createdAt: Date,
) {
  await prisma.project.update({
    where: { id: projectId },
    data: { createdAt, updatedAt: createdAt },
  });
  await prisma.estimate.update({
    where: { id: estimateId },
    data: { createdAt, updatedAt: createdAt },
  });
}

describe("critical flows", () => {
  let admin: TestUser;
  let gestor: TestUser;
  let projetista: TestUser;
  let consulta: TestUser;
  let adminAuth: Awaited<ReturnType<typeof login>>;
  let gestorAuth: Awaited<ReturnType<typeof login>>;
  let projetistaAuth: Awaited<ReturnType<typeof login>>;
  let consultaAuth: Awaited<ReturnType<typeof login>>;

  beforeEach(async () => {
    await resetDatabase();
    catalogSequence = 1;
    await seedPermissionsMatrix();
    admin = await createUser("admin@sagep.com", "ADMIN");
    gestor = await createUser("gestor@sagep.com", "GESTOR");
    projetista = await createUser("projetista@sagep.com", "PROJETISTA");
    consulta = await createUser("consulta@sagep.com", "CONSULTA");
    adminAuth = await login(admin.email);
    gestorAuth = await login(gestor.email);
    projetistaAuth = await login(projetista.email);
    consultaAuth = await login(consulta.email);
  });

  afterAll(async () => {
    await pdfService.closeBrowser();
    await prisma.$disconnect();
  });

  it("auth: login, refresh and logout", async () => {
    expect(adminAuth.accessToken).toBeTruthy();
    expect(adminAuth.refreshToken).toBeTruthy();

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(me.body.role).toBe("ADMIN");
    expect(me.body.permissions).toContain("tasks.create");
    expect(me.body.permissions).toContain("estimates.finalize");
    expect(me.body.permissions).toContain("dashboard.view_executive");
    expect(me.body.permissions).toContain("atas.manage");
    expect(me.body.permissions).toContain("military_organizations.manage");
    expect(me.body.access.role).toBe("ADMIN");
    expect(me.body.access.isAdmin).toBe(true);
    expect(me.body.access.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Tarefas",
          permissions: expect.arrayContaining([
            expect.objectContaining({
              code: "tasks.create",
              description: expect.any(String),
            }),
          ]),
        }),
      ]),
    );
    expect(me.body.lastLoginAt).toBeTruthy();
    expect(me.body.updatedAt).toBeTruthy();
    expect(adminAuth.user.permissions).toContain("tasks.create");

    const loggedUser = await prisma.user.findUnique({
      where: { id: admin.id },
      select: { lastLoginAt: true },
    });
    expect(loggedUser?.lastLoginAt).toBeInstanceOf(Date);

    const loginAudit = await prisma.auditLog.findFirst({
      where: { action: "LOGIN", actorUserId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    const loginMetadata = loginAudit?.metadata as Record<string, unknown>;
    expect(loginMetadata.email).toBe(admin.email);
    expect(loginMetadata.role).toBe("ADMIN");
    expect(loginMetadata.refreshTokenId).toBeTruthy();

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("User-Agent", "sagep-test-agent")
      .set("Cookie", adminAuth.refreshCookie)
      .expect(200);

    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeUndefined();
    const rotatedCookie = refreshed.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(rotatedCookie).toBeTruthy();
    if (!rotatedCookie) throw new Error("Cookie de renovação não foi rotacionado");
    const rotatedRefreshToken = decodeURIComponent(rotatedCookie.slice(rotatedCookie.indexOf("=") + 1));
    expect(rotatedRefreshToken).not.toBe(adminAuth.refreshToken);

    const rotatedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(adminAuth.refreshToken) },
    });
    expect(rotatedToken?.lastUsedAt).toBeInstanceOf(Date);
    expect(rotatedToken?.revokedReason).toBe("ROTATED");
    expect(rotatedToken?.revokedByUserId).toBeNull();

    const refreshAudit = await prisma.auditLog.findFirst({
      where: { action: "TOKEN_REFRESH", actorUserId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    const refreshMetadata = refreshAudit?.metadata as Record<string, unknown>;
    expect(refreshMetadata.oldRefreshTokenId).toBe(rotatedToken?.id);
    expect(refreshMetadata.newRefreshTokenId).toBeTruthy();
    expect(refreshMetadata.userAgent).toBe("sagep-test-agent");

    await request(app)
      .post("/api/auth/logout")
      .set("User-Agent", "sagep-test-agent")
      .set("Cookie", rotatedCookie)
      .expect(200);

    const loggedOutToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rotatedRefreshToken) },
    });
    expect(loggedOutToken?.revokedReason).toBe("LOGOUT");
    expect(loggedOutToken?.revokedByUserId).toBe(admin.id);

    const logoutAudit = await prisma.auditLog.findFirst({
      where: { action: "LOGOUT", actorUserId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    const logoutMetadata = logoutAudit?.metadata as Record<string, unknown>;
    expect(logoutMetadata.refreshTokenId).toBe(loggedOutToken?.id);
    expect(logoutMetadata.revokedReason).toBe("LOGOUT");
    expect(logoutMetadata.alreadyRevoked).toBe(false);

    const revokedRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", rotatedCookie)
      .expect(401);

    expect(revokedRefresh.body.code).toBe("AUTH_REFRESH_TOKEN_REVOKED");
  });

  it("auth: public registration is disabled and malformed refresh is rejected", async () => {
    const registration = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Usuario Externo",
        email: "externo@sagep.com",
        password,
      })
      .expect(403);

    expect(registration.body.code).toBe("AUTH_PUBLIC_REGISTRATION_DISABLED");

    const malformedRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "sagep_refresh=nao-e-um-jwt")
      .expect(401);

    expect(malformedRefresh.body.code).toBe("AUTH_REFRESH_TOKEN_INVALID_OR_EXPIRED");
  });

  it("auth: exige senha recente para operação crítica após renovação silenciosa", async () => {
    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", adminAuth.refreshCookie)
      .expect(200);

    const blocked = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .send({})
      .expect(428);

    expect(blocked.body.code).toBe("AUTH_STEP_UP_REQUIRED");

    const backupId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    await request(app)
      .get(`/api/backups/${backupId}/download`)
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(428);

    const reauthenticated = await request(app)
      .post("/api/auth/reauthenticate")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .send({ password })
      .expect(200);

    expect(reauthenticated.body.stepUpToken).toBeTruthy();
    expect(reauthenticated.body.expiresInSeconds).toBe(300);

    const passedBarrier = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .set("X-SAGEP-Reauth", reauthenticated.body.stepUpToken)
      .send({})
      .expect(400);

    expect(passedBarrier.body.code).not.toMatch(/^AUTH_STEP_UP/);

    await request(app)
      .get(`/api/backups/${backupId}/download`)
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .set("X-SAGEP-Reauth", reauthenticated.body.stepUpToken)
      .expect(404);

    const successAudit = await prisma.auditLog.findFirst({
      where: { action: "REAUTHENTICATION_SUCCESS", actorUserId: admin.id },
    });
    expect(successAudit).toBeTruthy();
  });

  it("auth: bloqueia origem cruzada nos endpoints ligados ao cookie", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://origem-nao-autorizada.example")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ email: admin.email, password })
      .expect(403);

    expect(response.body.code).toBe("CSRF_ORIGIN_DENIED");
  });

  it("settings: armazena o token do Portal criptografado sem devolvê-lo ou auditá-lo", async () => {
    const plaintext = "token-do-portal-super-secreto";
    const reauthenticated = await request(app)
      .post("/api/auth/reauthenticate")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ password })
      .expect(200);
    const authorization = { Authorization: `Bearer ${adminAuth.accessToken}` };

    await request(app)
      .put("/api/system-settings/portal-api-token")
      .set(authorization)
      .send({ token: plaintext })
      .expect(428);

    const saved = await request(app)
      .put("/api/system-settings/portal-api-token")
      .set(authorization)
      .set("X-SAGEP-Reauth", reauthenticated.body.stepUpToken)
      .send({ token: plaintext })
      .expect(200);

    expect(saved.body.portalApiToken).toMatchObject({ configured: true, source: "DATABASE" });
    expect(JSON.stringify(saved.body)).not.toContain(plaintext);
    const stored = await prisma.systemConfiguration.findUniqueOrThrow({ where: { id: "default" } });
    expect(stored.portalApiTokenEncrypted).toBeTruthy();
    expect(stored.portalApiTokenEncrypted).not.toContain(plaintext);

    const settings = await request(app).get("/api/system-settings").set(authorization).expect(200);
    expect(JSON.stringify(settings.body)).not.toContain(plaintext);
    expect(JSON.stringify(settings.body)).not.toContain(stored.portalApiTokenEncrypted);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "SYSTEM_SETTINGS", entityId: "PORTAL_TRANSPARENCIA_API_TOKEN" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(audit)).not.toContain(plaintext);
    expect(JSON.stringify(audit)).not.toContain(stored.portalApiTokenEncrypted);

    await request(app)
      .delete("/api/system-settings/portal-api-token")
      .set(authorization)
      .set("X-SAGEP-Reauth", reauthenticated.body.stepUpToken)
      .expect(200);
  });

  it("permissions persistence: role base is governed by persisted role permissions", async () => {
    const operationalPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: "dashboard.view_operational" },
      select: { id: true },
    });

    await prisma.rolePermission.delete({
      where: {
        role_permissionId: {
          role: "CONSULTA",
          permissionId: operationalPermission.id,
        },
      },
    });

    const consultaWithoutOperational = await login(consulta.email);

    expect(consultaWithoutOperational.user.role).toBe("CONSULTA");
    expect(consultaWithoutOperational.user.permissions).not.toContain(
      "dashboard.view_operational",
    );

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${consultaWithoutOperational.accessToken}`)
      .expect(200);

    expect(me.body.permissions).not.toContain("dashboard.view_operational");

    await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${consultaWithoutOperational.accessToken}`)
      .expect(403);
  });

  it("permissions persistence: override ALLOW adds permission outside the role base", async () => {
    await request(app)
      .get("/api/dashboard/executive")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .get("/api/reports/projects/executive-summary.pdf")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    const permission = await prisma.permission.findUniqueOrThrow({
      where: {
        code: "dashboard.view_executive",
      },
      select: {
        id: true,
      },
    });

    await prisma.userPermissionOverride.upsert({
      where: {
        userId_permissionId: {
          userId: consulta.id,
          permissionId: permission.id,
        },
      },
      update: {
        effect: "ALLOW",
      },
      create: {
        id: `override:${consulta.id}:${permission.id}`,
        userId: consulta.id,
        permissionId: permission.id,
        effect: "ALLOW",
      },
    });

    const consultaWithAllow = await login(consulta.email);

    expect(consultaWithAllow.user.permissions).toContain("dashboard.view_executive");
    expect(consultaWithAllow.user.permissions).toContain("dashboard.view_operational");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${consultaWithAllow.accessToken}`)
      .expect(200);

    expect(me.body.permissions).toContain("dashboard.view_executive");
    expect(me.body.access.permissions).toContain("dashboard.view_executive");

    await request(app)
      .get("/api/dashboard/executive")
      .set("Authorization", `Bearer ${consultaWithAllow.accessToken}`)
      .expect(200);
  });

  it("permissions persistence: override DENY removes permission inherited from the role", async () => {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: {
        code: "dashboard.view_operational",
      },
      select: {
        id: true,
      },
    });

    await prisma.userPermissionOverride.upsert({
      where: {
        userId_permissionId: {
          userId: consulta.id,
          permissionId: permission.id,
        },
      },
      update: {
        effect: "DENY",
      },
      create: {
        id: `override:${consulta.id}:${permission.id}`,
        userId: consulta.id,
        permissionId: permission.id,
        effect: "DENY",
      },
    });

    const consultaWithDeny = await login(consulta.email);

    expect(consultaWithDeny.user.permissions).not.toContain("dashboard.view_operational");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${consultaWithDeny.accessToken}`)
      .expect(200);

    expect(me.body.permissions).not.toContain("dashboard.view_operational");
    expect(me.body.access.permissions).not.toContain("dashboard.view_operational");

    await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${consultaWithDeny.accessToken}`)
      .expect(403);
  });

  it("RBAC/IDOR: DENY individual restringe recursos diretos e visoes agregadas", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto Sigiloso IDOR");
    const { estimate } = await seedFinalizedEstimate(project.id);
    const task = await prisma.task.create({
      data: {
        title: "Tarefa Sigilosa IDOR",
        projectId: project.id,
        assigneeId: admin.id,
      },
    });
    const commitmentNote = await prisma.commitmentNote.create({
      data: {
        projectId: project.id,
        number: "2026NE999999",
        externalCode: `idor:${project.id}`,
        supplierName: "Fornecedor Sigiloso",
        currentAmount: "200.00",
        lastSyncAt: new Date(),
      },
    });

    await denyPermissionsForUser(gestor.id, [
      "projects.view_all",
      "tasks.view_all",
      "estimates.view_all",
    ]);

    const restrictedGestor = await login(gestor.email);

    expect(restrictedGestor.user.permissions).not.toContain("projects.view_all");
    expect(restrictedGestor.user.permissions).not.toContain("tasks.view_all");
    expect(restrictedGestor.user.permissions).not.toContain("estimates.view_all");

    const authorization = { Authorization: `Bearer ${restrictedGestor.accessToken}` };

    await request(app).get(`/api/projects/${project.id}`).set(authorization).expect(403);
    await request(app)
      .get(`/api/projects/code/${project.projectCode}`)
      .set(authorization)
      .expect(403);
    await request(app).get(`/api/projects/${project.id}/members`).set(authorization).expect(403);

    await request(app).get(`/api/tasks/${task.id}`).set(authorization).expect(403);
    await request(app).get(`/api/tasks/code/${task.taskCode}`).set(authorization).expect(403);

    await request(app).get(`/api/estimates/${estimate.id}`).set(authorization).expect(403);
    await request(app)
      .get(`/api/estimates/code/${estimate.estimateCode}`)
      .set(authorization)
      .expect(403);
    await request(app)
      .get(`/api/estimates/${estimate.id}/document/html`)
      .set(authorization)
      .expect(403);

    const searchResponse = await request(app)
      .get("/api/search")
      .query({ q: "Projeto Sigiloso IDOR" })
      .set(authorization)
      .expect(200);

    expect(searchResponse.body.groups.projects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: project.id })]),
    );

    const financialResponse = await request(app)
      .get("/api/financial-execution/commitment-notes")
      .set(authorization)
      .expect(200);

    expect(financialResponse.body.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: commitmentNote.id })]),
    );
    await request(app)
      .get(`/api/financial-execution/commitment-notes/${commitmentNote.id}`)
      .set(authorization)
      .expect(404);

    const dashboardResponse = await request(app)
      .get("/api/dashboard/operational")
      .set(authorization)
      .expect(200);

    expect(dashboardResponse.body.operationalQueue).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: project.id })]),
    );
    expect(dashboardResponse.body.alerts.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ project: expect.objectContaining({ id: project.id }) }),
      ]),
    );

    const alertsResponse = await request(app)
      .get("/api/operational-alerts")
      .set(authorization)
      .expect(200);

    expect(alertsResponse.body.alerts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ project: expect.objectContaining({ id: project.id }) }),
      ]),
    );
  });

  it("permissions admin: permissions.view allows read access, but write remains restricted", async () => {
    await request(app)
      .get("/api/permissions/catalog")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .get("/api/permissions/catalog")
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(200);

    await request(app)
      .put("/api/permissions/roles/CONSULTA")
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .send({ permissions: rolePermissions.CONSULTA })
      .expect(403);
  });

  it("permissions admin: exposes catalog, role base, overrides and effective permissions for frontend", async () => {
    const catalogResponse = await request(app)
      .get("/api/permissions/catalog")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(catalogResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "dashboard.view_executive",
          module: "dashboard",
          group: "Dashboards",
          action: "view_executive",
        }),
      ]),
    );

    const roleResponse = await request(app)
      .get("/api/permissions/roles/CONSULTA")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(roleResponse.body.role).toBe("CONSULTA");
    expect(roleResponse.body.source).toBe("database");
    expect(roleResponse.body.basePermissions).toContain("dashboard.view_operational");
    expect(roleResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "dashboard.view_operational",
          assigned: true,
        }),
      ]),
    );

    const allowResponse = await request(app)
      .post(`/api/permissions/users/${consulta.id}/overrides/allow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ permissionCode: "dashboard.view_executive" })
      .expect(200);

    expect(allowResponse.body.override.effect).toBe("ALLOW");
    expect(allowResponse.body.summary.effectivePermissions).toContain("dashboard.view_executive");

    const allowAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "USER",
        entityId: consulta.id,
        action: "UPDATE",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const allowAuditMetadata = allowAudit?.metadata as Record<string, unknown>;
    expect(allowAudit?.summary).toContain("override ALLOW");
    expect(allowAuditMetadata.source).toBe("override");
    expect(allowAuditMetadata.permission).toBe("dashboard.view_executive");
    expect(allowAuditMetadata.afterEffect).toBe("ALLOW");

    const denyResponse = await request(app)
      .post(`/api/permissions/users/${consulta.id}/overrides/deny`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ permissionCode: "dashboard.view_operational" })
      .expect(200);

    expect(denyResponse.body.override.effect).toBe("DENY");
    expect(denyResponse.body.summary.effectivePermissions).not.toContain(
      "dashboard.view_operational",
    );

    const userResponse = await request(app)
      .get(`/api/permissions/users/${consulta.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(userResponse.body.user.id).toBe(consulta.id);
    expect(userResponse.body.roleBasePermissions).toContain("dashboard.view_operational");
    expect(userResponse.body.effectivePermissions).toContain("dashboard.view_executive");
    expect(userResponse.body.effectivePermissions).not.toContain("dashboard.view_operational");
    expect(userResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "dashboard.view_executive",
          grantedByRole: false,
          overrideEffect: "ALLOW",
          effective: true,
        }),
        expect.objectContaining({
          code: "dashboard.view_operational",
          grantedByRole: true,
          overrideEffect: "DENY",
          effective: false,
        }),
      ]),
    );

    const overridesResponse = await request(app)
      .get(`/api/permissions/users/${consulta.id}/overrides`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(overridesResponse.body.overrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "dashboard.view_executive",
          effect: "ALLOW",
        }),
        expect.objectContaining({
          code: "dashboard.view_operational",
          effect: "DENY",
        }),
      ]),
    );

    const removeResponse = await request(app)
      .delete(`/api/permissions/users/${consulta.id}/overrides/dashboard.view_operational`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(removeResponse.body.removedOverride).toEqual({
      code: "dashboard.view_operational",
      effect: "DENY",
    });
    expect(removeResponse.body.summary.effectivePermissions).toContain(
      "dashboard.view_operational",
    );
  });

  it("permissions admin: updating role base in the API changes login, /auth/me and authorization", async () => {
    const nextConsultaPermissions = [
      ...rolePermissions.CONSULTA.filter((permission) => permission !== "dashboard.view_operational"),
      "dashboard.view_executive",
    ];

    const updateResponse = await request(app)
      .put("/api/permissions/roles/CONSULTA")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ permissions: nextConsultaPermissions })
      .expect(200);

    expect(updateResponse.body.role).toBe("CONSULTA");
    expect(updateResponse.body.basePermissions).toContain("dashboard.view_executive");
    expect(updateResponse.body.basePermissions).not.toContain("dashboard.view_operational");

    const roleAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "AUTH",
        entityId: "role:CONSULTA",
        action: "UPDATE",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const roleAuditMetadata = roleAudit?.metadata as Record<string, unknown>;
    expect(roleAudit?.summary).toContain("role CONSULTA");
    expect(roleAuditMetadata.source).toBe("role");
    expect(roleAuditMetadata.targetRole).toBe("CONSULTA");
    expect(roleAuditMetadata.addedPermissions).toEqual(
      expect.arrayContaining(["dashboard.view_executive"]),
    );

    const consultaWithUpdatedRole = await login(consulta.email);

    expect(consultaWithUpdatedRole.user.permissions).toContain("dashboard.view_executive");
    expect(consultaWithUpdatedRole.user.permissions).not.toContain("dashboard.view_operational");

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${consultaWithUpdatedRole.accessToken}`)
      .expect(200);

    expect(me.body.permissions).toContain("dashboard.view_executive");
    expect(me.body.permissions).not.toContain("dashboard.view_operational");

    await request(app)
      .get("/api/dashboard/executive")
      .set("Authorization", `Bearer ${consultaWithUpdatedRole.accessToken}`)
      .expect(200);

    await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${consultaWithUpdatedRole.accessToken}`)
      .expect(403);
  });

  it("permissions admin: blocks self-permission changes and editing own role base", async () => {
    await request(app)
      .post(`/api/permissions/users/${admin.id}/overrides/allow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ permissionCode: "dashboard.view_executive" })
      .expect(403);

    await request(app)
      .delete(`/api/permissions/users/${admin.id}/overrides/dashboard.view_executive`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(403);

    await request(app)
      .put("/api/permissions/roles/ADMIN")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ permissions: rolePermissions.ADMIN })
      .expect(403);
  });

  it("permissions admin: non-admin override manager cannot grant critical permissions", async () => {
    const manageUserOverridesPermission = await prisma.permission.findUniqueOrThrow({
      where: {
        code: "permissions.manage_user_overrides",
      },
      select: {
        id: true,
      },
    });

    await prisma.userPermissionOverride.upsert({
      where: {
        userId_permissionId: {
          userId: gestor.id,
          permissionId: manageUserOverridesPermission.id,
        },
      },
      update: {
        effect: "ALLOW",
      },
      create: {
        id: `override:${gestor.id}:${manageUserOverridesPermission.id}`,
        userId: gestor.id,
        permissionId: manageUserOverridesPermission.id,
        effect: "ALLOW",
      },
    });

    const gestorWithOverrideManagement = await login(gestor.email);

    await request(app)
      .post(`/api/permissions/users/${consulta.id}/overrides/allow`)
      .set("Authorization", `Bearer ${gestorWithOverrideManagement.accessToken}`)
      .send({ permissionCode: "atas.manage" })
      .expect(403);

    await request(app)
      .post(`/api/permissions/users/${gestor.id}/overrides/allow`)
      .set("Authorization", `Bearer ${gestorWithOverrideManagement.accessToken}`)
      .send({ permissionCode: "reports.export" })
      .expect(403);
  });

  it("auth: records failed login without exposing sensitive token data", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "sagep-test-agent")
      .send({ email: admin.email, password: "senha-errada" })
      .expect(401);

    const failedLoginAudit = await prisma.auditLog.findFirst({
      where: { action: "LOGIN_FAILED", actorUserId: admin.id },
      orderBy: { createdAt: "desc" },
    });

    const metadata = failedLoginAudit?.metadata as Record<string, unknown>;
    expect(metadata.email).toBe(admin.email);
    expect(metadata.reason).toBe("INVALID_PASSWORD");
    expect(metadata.userAgent).toBe("sagep-test-agent");
    expect(metadata.password).toBeUndefined();
    expect(metadata.token).toBeUndefined();
    expect(metadata.tokenHash).toBeUndefined();
  });

  it("auth: bloqueia temporariamente a conta e limpa o bloqueio após expirar", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: admin.email, password: "senha-errada" })
        .expect(401);
    }

    const lockedUser = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(lockedUser.failedLoginAttempts).toBe(5);
    expect(lockedUser.lockedUntil).toBeInstanceOf(Date);

    const blocked = await request(app)
      .post("/api/auth/login")
      .send({ email: admin.email, password })
      .expect(401);
    expect(blocked.body.message).toBe("E-mail ou senha inválidos");

    await prisma.user.update({
      where: { id: admin.id },
      data: { lockedUntil: new Date(Date.now() - 1_000) },
    });

    await request(app)
      .post("/api/auth/login")
      .send({ email: admin.email.toUpperCase(), password })
      .expect(200);

    const unlockedUser = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(unlockedUser.failedLoginAttempts).toBe(0);
    expect(unlockedUser.lockedUntil).toBeNull();
  });

  it("auth profile: updates only personal fields and changes password with session revocation", async () => {
    const profileUser = await createUser(
      `perfil-${Date.now()}@sagep.local`,
      "CONSULTA",
      "Usuario Perfil",
    );
    const profileAuth = await login(profileUser.email, "sagep-profile-device");

    const updatedProfile = await request(app)
      .patch("/api/auth/profile")
      .set("Authorization", `Bearer ${profileAuth.accessToken}`)
      .send({
        name: "Usuario Perfil Atualizado",
        warName: "Perfil",
        rank: "1º Ten",
        cpf: "99988877766",
        phone: "92999998888",
        themePreference: "SYSTEM",
        notifications: {
          taskAssignments: false,
          deadlines: true,
          workflowUpdates: false,
        },
      })
      .expect(200);

    expect(updatedProfile.body).toMatchObject({
      id: profileUser.id,
      name: "Usuario Perfil Atualizado",
      warName: "Perfil",
      email: profileUser.email,
      role: "CONSULTA",
      rank: "1º Ten",
      cpf: "99988877766",
      phone: "92999998888",
      themePreference: "SYSTEM",
      notifications: {
        taskAssignments: false,
        deadlines: true,
        workflowUpdates: false,
      },
    });

    const forbiddenRoleChange = await request(app)
      .patch("/api/auth/profile")
      .set("Authorization", `Bearer ${profileAuth.accessToken}`)
      .send({ role: "ADMIN" })
      .expect(400);
    expect(forbiddenRoleChange.body.message).toBeTruthy();

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${profileAuth.accessToken}`)
      .send({ currentPassword: "senha-incorreta", newPassword: "nova-senha-123" })
      .expect(401);

    const changedPassword = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${profileAuth.accessToken}`)
      .send({ currentPassword: password, newPassword: "nova-senha-123" })
      .expect(200);

    expect(changedPassword.body.logoutRequired).toBe(true);
    expect(changedPassword.body.revokedSessions).toBeGreaterThanOrEqual(1);

    await request(app)
      .post("/api/auth/login")
      .send({ email: profileUser.email, password })
      .expect(401);

    await request(app)
      .post("/api/auth/login")
      .send({ email: profileUser.email, password: "nova-senha-123" })
      .expect(200);
  });

  it("auth sessions: supports own and administrative management with differentiated status", async () => {
    const secondAdminAuth = await login(admin.email, "sagep-admin-device-2");
    const secondConsultaAuth = await login(consulta.email, "sagep-consulta-device-2");

    await prisma.refreshToken.create({
      data: {
        userId: admin.id,
        tokenHash: hashToken("expired-admin-session"),
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        createdUserAgent: "sagep-expired-device",
      },
    });

    const ownActiveSessions = await request(app)
      .get("/api/auth/sessions")
      .set("User-Agent", "sagep-admin-device-2")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(ownActiveSessions.body.permissionUsed).toBe("sessions.manage_own");
    expect(ownActiveSessions.body.scope).toBe("OWN");
    expect(ownActiveSessions.body.governance.canCleanup).toBe(false);
    expect(ownActiveSessions.body.filters.status).toBe("ACTIVE");
    expect(ownActiveSessions.body.meta.totalItems).toBeGreaterThanOrEqual(2);
    expect(ownActiveSessions.body.links.self).toContain("/api/auth/sessions");
    expect(ownActiveSessions.body.summary.active).toBeGreaterThanOrEqual(2);
    expect(ownActiveSessions.body.summary.expired).toBeGreaterThanOrEqual(1);
    expect(ownActiveSessions.body.summary.byStatus.ACTIVE).toBe(ownActiveSessions.body.summary.active);
    expect(ownActiveSessions.body.summary.currentSessionDetected).toBe(true);
    expect(ownActiveSessions.body.summary.currentSessionConfidence).toBe("USER_AGENT");

    const secondAdminSession = ownActiveSessions.body.sessions.find(
      (session: { createdUserAgent: string; status: string }) =>
        session.createdUserAgent === "sagep-admin-device-2" && session.status === "ACTIVE",
    );

    expect(secondAdminSession?.id).toBeTruthy();
    expect(secondAdminSession.currentSession).toBe(true);
    expect(secondAdminSession.statusDetail.label).toBe("Ativa");
    expect(secondAdminSession.securityContext.userAgent).toBe("sagep-admin-device-2");
    expect(ownActiveSessions.body.summary.currentSessionId).toBe(secondAdminSession.id);

    await request(app)
      .post(`/api/auth/sessions/${secondAdminSession.id}/revoke`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("sessions.manage_own");
        expect(response.body.session.status).toBe("REVOKED");
        expect(response.body.session.revokedReason).toBe("SECURITY");
      });

    const revokedOwnSessions = await request(app)
      .get("/api/auth/sessions")
      .query({ status: "REVOKED" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(
      revokedOwnSessions.body.sessions.some(
        (session: { id: string }) => session.id === secondAdminSession.id,
      ),
    ).toBe(true);

    const expiredOwnSessions = await request(app)
      .get("/api/auth/sessions")
      .query({ status: "EXPIRED" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(expiredOwnSessions.body.sessions.some((session: { status: string }) => session.status === "EXPIRED")).toBe(true);

    await request(app)
      .get(`/api/auth/users/${consulta.id}/sessions`)
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    const consultaSessions = await request(app)
      .get(`/api/auth/users/${consulta.id}/sessions`)
      .query({ status: "ACTIVE" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(consultaSessions.body.permissionUsed).toBe("sessions.manage_all");
    expect(consultaSessions.body.scope).toBe("ADMIN");
    expect(consultaSessions.body.governance.canCleanup).toBe(true);
    expect(consultaSessions.body.summary.currentSessionDetected).toBe(false);
    expect(consultaSessions.body.user.id).toBe(consulta.id);
    expect(consultaSessions.body.meta.totalItems).toBeGreaterThanOrEqual(1);

    const consultaSessionToRevoke = consultaSessions.body.sessions.find(
      (session: { createdUserAgent: string }) =>
        session.createdUserAgent === "sagep-consulta-device-2",
    );

    expect(consultaSessionToRevoke?.id).toBeTruthy();

    await request(app)
      .post(`/api/auth/users/${consulta.id}/sessions/${consultaSessionToRevoke.id}/revoke`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("sessions.manage_all");
        expect(response.body.session.status).toBe("REVOKED");
        expect(response.body.session.revokedReason).toBe("ADMIN_REVOKED");
      });

    await request(app)
      .post(`/api/auth/users/${consulta.id}/sessions/revoke-all`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("sessions.manage_all");
        expect(response.body.revokedCount).toBeGreaterThanOrEqual(1);
      });

    const consultaTokenAfterAdminRevoke = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(secondConsultaAuth.refreshToken) },
    });
    expect(consultaTokenAfterAdminRevoke?.revokedReason).toBe("ADMIN_REVOKED");

    const revokeAudit = await prisma.auditLog.findFirst({
      where: { action: "SESSION_REVOKE", actorUserId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(revokeAudit).toBeTruthy();

    const revokeAllAudit = await prisma.auditLog.findFirst({
      where: { action: "SESSION_REVOKE_ALL", actorUserId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(revokeAllAudit).toBeTruthy();

    await request(app)
      .post("/api/auth/sessions/cleanup")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ refreshTokenRetentionDays: 3650, auditRetentionDays: 3650 })
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("sessions.manage_all");
        expect(response.body.scope).toBe("ADMIN");
        expect(response.body.governance.canCleanup).toBe(true);
        expect(response.body.retentionPolicy.refreshTokens.retentionDays).toBe(3650);
        expect(response.body.summary.deletedRefreshTokens).toBeGreaterThanOrEqual(0);
      });
  });

  it("projects: create, updateFlow and details", async () => {
    const { project } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
      })
      .expect(200);

    const details = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(details.body.project.id).toBe(project.id);
    expect(details.body.workflow.nextAction.code).toBe("EMITIR_DIEX");
    expect(Array.isArray(details.body.pendingActions)).toBe(true);
  });

  it("projects: records credit note and advances to DIEX_REQUISITORIO without requiring DIEx data", async () => {
    const { project } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);

    const updated = await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    expect(updated.body.stage).toBe("DIEX_REQUISITORIO");
    expect(updated.body.creditNoteNumber).toBe("NC-001");
    expect(updated.body.creditNoteReceivedAt).toBeTruthy();
    expect(updated.body.diexNumber).toBeNull();
    expect(updated.body.diexIssuedAt).toBeNull();

    const details = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(details.body.workflow.stage).toBe("DIEX_REQUISITORIO");
    expect(details.body.workflow.milestones.creditNoteNumber).toBe("NC-001");
    expect(details.body.workflow.milestones.creditNoteReceivedAt).toBeTruthy();
    expect(details.body.workflow.nextAction.code).toBe("EMITIR_DIEX");
    expect(
      details.body.pendingActions.some(
        (action: { code: string; targetStage?: string }) =>
          action.code === "EMITIR_DIEX" && action.targetStage === "DIEX_REQUISITORIO",
      ),
    ).toBe(true);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.message).toContain("DIEx");
      });

    const stageAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "PROJECT",
        entityId: project.id,
        action: "STAGE_CHANGE",
        metadata: {
          path: ["newStage"],
          equals: "DIEX_REQUISITORIO",
        },
      },
      orderBy: { createdAt: "desc" },
    });

    expect(stageAudit).toBeTruthy();
    expect((stageAudit?.metadata as Record<string, unknown>)?.nextActionCode).toBe(
      "EMITIR_DIEX",
    );
  });

  it("workflow: DIEx emission advances to commitment note and NE advances to OS queue", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-002",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    const afterDiex = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(afterDiex.body.workflow.stage).toBe("AGUARDANDO_NOTA_EMPENHO");
    expect(afterDiex.body.workflow.milestones.diexNumber).toBe("DIEX-001");
    expect(afterDiex.body.workflow.milestones.diexIssuedAt).toBeTruthy();
    expect(afterDiex.body.workflow.nextAction.code).toBe("INFORMAR_NOTA_EMPENHO");

    const afterCommitmentNote = await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-002",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    expect(afterCommitmentNote.body.stage).toBe("OS_LIBERADA");
    expect(afterCommitmentNote.body.commitmentNoteNumber).toBe("NE-002");
    expect(afterCommitmentNote.body.serviceOrderNumber).toBeNull();

    const afterNeDetails = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(afterNeDetails.body.workflow.stage).toBe("OS_LIBERADA");
    expect(afterNeDetails.body.workflow.nextAction.code).toBe("EMITIR_OS");
    expect(afterNeDetails.body.timeline.some(
      (item: { entityType: string; entityId: string; action: string }) =>
        item.entityType === "PROJECT" &&
        item.entityId === project.id &&
        item.action === "STAGE_CHANGE",
    )).toBe(true);

    const projectStageAudits = await prisma.auditLog.findMany({
      where: {
        entityType: "PROJECT",
        entityId: project.id,
        action: "STAGE_CHANGE",
      },
      orderBy: { createdAt: "asc" },
    });

    expect(
      projectStageAudits.some(
        (audit) =>
          (audit.metadata as Record<string, unknown> | null)?.newStage ===
            "AGUARDANDO_NOTA_EMPENHO" &&
          (audit.metadata as Record<string, unknown> | null)?.nextActionCode ===
            "INFORMAR_NOTA_EMPENHO",
      ),
    ).toBe(true);
    expect(
      projectStageAudits.some(
        (audit) =>
          (audit.metadata as Record<string, unknown> | null)?.newStage === "OS_LIBERADA" &&
          (audit.metadata as Record<string, unknown> | null)?.nextActionCode === "EMITIR_OS",
      ),
    ).toBe(true);
  });

  it("workflow: registra NE manual com justificativa, auditoria e status não validado", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-MANUAL-001",
        creditNoteReceivedAt: "2026-08-23T00:00:00.000Z",
      })
      .expect(200);
    await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    const response = await request(app)
      .post("/api/financial-execution/commitment-notes")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        number: "2026NE000534",
        receivedAt: "2026-08-24T00:00:00.000Z",
        registrationMode: "MANUAL",
        manualReason: "Portal da Transparência indisponível durante o registro",
        confirmManualRegistration: true,
      })
      .expect(201);

    expect(response.body.project.stage).toBe("OS_LIBERADA");
    expect(response.body.commitmentNote).toMatchObject({
      number: "2026NE000534",
      source: "MANUAL",
      syncStatus: "NAO_VALIDADO",
    });
    expect(response.body.validation.status).toBe("NAO_VALIDADO");

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: "COMMITMENT_NOTE",
        entityId: response.body.commitmentNote.id,
        action: "CREATE",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.metadata).toMatchObject({
      registrationMode: "MANUAL",
      portalValidated: false,
    });
  });

  it("workflow: As-Built review approves to ATESTAR_NF and rejects back to SERVICO_EM_EXECUCAO", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-010",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-010",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        diexId: diex.id,
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    const waitingSignature = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(waitingSignature.body.workflow.stage).toBe("AGUARDANDO_OS_ASSINADA");
    expect(waitingSignature.body.workflow.nextAction.code).toBe("REGISTRAR_OS_ASSINADA");

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "SERVICO_EM_EXECUCAO",
        executionStartedAt: "2026-04-04T00:00:00.000Z",
      })
      .expect(409);

    await registerSignedServiceOrder(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "SERVICO_EM_EXECUCAO",
        executionStartedAt: "2026-04-04T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "ANALISANDO_AS_BUILT",
        asBuiltReceivedAt: "2026-04-05T00:00:00.000Z",
      })
      .expect(200);

    const nextActionBeforeReview = await request(app)
      .get(`/api/projects/${project.id}/next-action`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(nextActionBeforeReview.body.code).toBe("VALIDAR_AS_BUILT");

    await request(app)
      .patch(`/api/projects/${project.id}/as-built/review`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        approved: false,
        reviewedAt: "2026-04-06T00:00:00.000Z",
      })
      .expect(400);

    const rejected = await request(app)
      .patch(`/api/projects/${project.id}/as-built/review`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        approved: false,
        reviewedAt: "2026-04-06T00:00:00.000Z",
        rejectionReason: "Documento incompleto",
      })
      .expect(200);

    expect(rejected.body.stage).toBe("SERVICO_EM_EXECUCAO");
    expect(rejected.body.asBuiltReceivedAt).toBeNull();
    expect(rejected.body.asBuiltRejectedAt).toBeTruthy();
    expect(rejected.body.asBuiltRejectionReason).toBe("Documento incompleto");

    const nextActionAfterReject = await request(app)
      .get(`/api/projects/${project.id}/next-action`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(nextActionAfterReject.body.code).toBe("ANEXAR_AS_BUILT");

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "ANALISANDO_AS_BUILT",
        asBuiltReceivedAt: "2026-04-07T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/as-built/review`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        approved: true,
        reviewedAt: "2026-04-08T00:00:00.000Z",
      })
      .expect(400);

    const approved = await request(app)
      .patch(`/api/projects/${project.id}/as-built/review`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        approved: true,
        reviewedAt: "2026-04-08T00:00:00.000Z",
        asBuiltLink: "https://drive.example.mil.br/pastas/as-built-prj",
      })
      .expect(200);

    expect(approved.body.stage).toBe("ATESTAR_NF");
    expect(approved.body.asBuiltReviewedAt).toBeTruthy();
    expect(approved.body.asBuiltApprovedAt).toBeTruthy();
    expect(approved.body.asBuiltLink).toBe("https://drive.example.mil.br/pastas/as-built-prj");
    expect(approved.body.asBuiltRejectedAt).toBeNull();
    expect(approved.body.asBuiltRejectionReason).toBeNull();

    const detailsAfterApproval = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsAfterApproval.body.workflow.stage).toBe("ATESTAR_NF");
    expect(detailsAfterApproval.body.workflow.nextAction.code).toBe("ATESTAR_NF");

    const reviewAudits = await prisma.auditLog.findMany({
      where: {
        entityType: "PROJECT",
        entityId: project.id,
        metadata: {
          path: ["source"],
          equals: "project.as-built.review",
        },
      },
      orderBy: { createdAt: "asc" },
    });

    expect(
      reviewAudits.some(
        (audit) =>
          audit.action === "UPDATE" &&
          (audit.metadata as Record<string, unknown> | null)?.approved === false &&
          (audit.metadata as Record<string, unknown> | null)?.rejectionReason ===
            "Documento incompleto",
      ),
    ).toBe(true);
    expect(
      reviewAudits.some(
        (audit) =>
          audit.action === "STAGE_CHANGE" &&
          (audit.metadata as Record<string, unknown> | null)?.newStage ===
            "SERVICO_EM_EXECUCAO" &&
          (audit.metadata as Record<string, unknown> | null)?.nextActionCode ===
            "ANEXAR_AS_BUILT",
      ),
    ).toBe(true);
    expect(
      reviewAudits.some(
        (audit) =>
          audit.action === "STAGE_CHANGE" &&
          (audit.metadata as Record<string, unknown> | null)?.newStage === "ATESTAR_NF" &&
          (audit.metadata as Record<string, unknown> | null)?.nextActionCode ===
            "ATESTAR_NF",
      ),
    ).toBe(true);
  });

  it("workflow: opens technical delivery after execution is closed", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-020",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-020",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        diexId: diex.id,
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await registerSignedServiceOrder(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "SERVICO_EM_EXECUCAO",
        executionStartedAt: "2026-04-04T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "ANALISANDO_AS_BUILT",
        asBuiltReceivedAt: "2026-04-05T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/as-built/review`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        approved: true,
        reviewedAt: "2026-04-06T00:00:00.000Z",
        asBuiltLink: "https://drive.example.mil.br/arquivos/as-built-1.pdf",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "ATESTAR_NF",
        invoiceAttestedAt: "2026-04-07T00:00:00.000Z",
      })
      .expect(200);

    const delivery = await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "ENTREGA_TECNICA",
        serviceCompletedAt: "2026-04-08T00:00:00.000Z",
      })
      .expect(200);

    expect(delivery.body.status).toBe("EM_ANDAMENTO");
    expect(delivery.body.stage).toBe("ENTREGA_TECNICA");
    expect(delivery.body.invoiceAttestedAt).toBeTruthy();
    expect(delivery.body.serviceCompletedAt).toBeTruthy();

    const nextAction = await request(app)
      .get(`/api/projects/${project.id}/next-action`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(nextAction.body.code).toBe("GERAR_RELATORIO_ENTREGA");
  });

  it("workflow: rejects skipping invoice attestation and technical delivery", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-021",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-021",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        diexId: diex.id,
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await registerSignedServiceOrder(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "SERVICO_EM_EXECUCAO",
        executionStartedAt: "2026-04-04T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "ANALISANDO_AS_BUILT",
        asBuiltReceivedAt: "2026-04-05T00:00:00.000Z",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/as-built/review`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        approved: true,
        reviewedAt: "2026-04-06T00:00:00.000Z",
        asBuiltLink: "https://drive.example.mil.br/arquivos/as-built-2.pdf",
      })
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "SERVICO_CONCLUIDO",
        serviceCompletedAt: "2026-04-08T00:00:00.000Z",
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.message).toContain("Transição inválida");
      });
  });

  it("estimates: finalizing an estimate advances the project workflow to awaiting credit note", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto Finalizacao Estimativa");
    const catalog = await createCatalog();

    const estimate = await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 1 }],
      })
      .expect(201);

    const initialNextAction = await request(app)
      .get(`/api/projects/${project.id}/next-action`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(initialNextAction.body.code).toBe("FINALIZAR_ESTIMATIVA");

    await request(app)
      .patch(`/api/estimates/${estimate.body.id}/status`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ status: "FINALIZADA" })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("FINALIZADA");
      });

    const details = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(details.body.workflow.stage).toBe("AGUARDANDO_NOTA_CREDITO");
    expect(details.body.workflow.status).toBe("EM_ANDAMENTO");
    expect(details.body.workflow.nextAction.code).toBe("EMITIR_DIEX");

    const nextAction = await request(app)
      .get(`/api/projects/${project.id}/next-action`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(nextAction.body.code).toBe("EMITIR_DIEX");

    const stageAudit = await prisma.auditLog.findFirst({
      where: {
        entityType: "PROJECT",
        entityId: project.id,
        action: "STAGE_CHANGE",
        summary: {
          contains: "após finalização da estimativa",
        },
      },
    });

    expect(stageAudit).toBeTruthy();

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    await issueDiex(project.id, estimate.body.id, adminAuth.accessToken);
  });

  it("workflow and alerts: keeps AGUARDANDO_NOTA_EMPENHO aligned with commitment note state", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await moveToCreditNote(project.id, adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);
    await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
      })
      .expect(200);

    const detailsWithoutCommitment = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsWithoutCommitment.body.workflow.stage).toBe("AGUARDANDO_NOTA_EMPENHO");
    expect(detailsWithoutCommitment.body.workflow.nextAction.code).toBe(
      "INFORMAR_NOTA_EMPENHO",
    );

    const alertsWithoutCommitment = await request(app)
      .get("/api/operational-alerts")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(
      alertsWithoutCommitment.body.alerts.some(
        (alert: { project: { id: string }; category: string; nextAction: { code: string } }) =>
          alert.project.id === project.id &&
          alert.category === "AGUARDANDO_NOTA_EMPENHO" &&
          alert.nextAction.code === "INFORMAR_NOTA_EMPENHO",
      ),
    ).toBe(true);

    const dashboardWithoutCommitment = await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(dashboardWithoutCommitment.body.pendingByStage.awaitingCommitmentNote).toBe(1);
    expect(dashboardWithoutCommitment.body.pendingByStage.awaitingServiceOrder).toBe(0);
    expect(
      dashboardWithoutCommitment.body.operationalQueue.find(
        (item: { id: string }) => item.id === project.id,
      ).nextAction.code,
    ).toBe("INFORMAR_NOTA_EMPENHO");

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
