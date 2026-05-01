import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashToken } from "../src/shared/auth-tokens.js";

const password = "123456";
let catalogSequence = 1;

const binaryParser = (res: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];

  res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
  res.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
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
  await prisma.serviceOrderDeliveredDocument.deleteMany();
  await prisma.serviceOrderScheduleItem.deleteMany();
  await prisma.serviceOrderItem.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.diexRequestItem.deleteMany();
  await prisma.diexRequest.deleteMany();
  await prisma.estimateItem.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.ataItem.deleteMany();
  await prisma.ataCoverageLocality.deleteMany();
  await prisma.ataCoverageGroup.deleteMany();
  await prisma.ata.deleteMany();
  await prisma.militaryOrganization.deleteMany();
  await prisma.user.deleteMany();
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
      rank: "2 Ten",
      cpf: "11122233344",
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });
}

async function login(email: string, userAgent?: string) {
  const requestBuilder = request(app).post("/api/auth/login");

  if (userAgent) {
    requestBuilder.set("User-Agent", userAgent);
  }

  const response = await requestBuilder.send({ email, password }).expect(200);

  return response.body as {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      role: string;
      permissions: string[];
      access: { role: string; permissions: string[]; isAdmin: boolean };
    };
  };
}

async function createCatalog() {
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

async function createProjectWithFinalizedEstimate(token: string) {
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
      .send({ refreshToken: adminAuth.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(adminAuth.refreshToken);

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
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(200);

    const loggedOutToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshed.body.refreshToken) },
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

    await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
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
        commitmentNoteNumber: "NE-001",
      })
      .expect(200);

    const detailsWithCommitment = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsWithCommitment.body.workflow.nextAction.code).toBe("EMITIR_OS");

    const alertsWithCommitment = await request(app)
      .get("/api/operational-alerts")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(
      alertsWithCommitment.body.alerts.some(
        (alert: { project: { id: string }; category: string; nextAction: { code: string } }) =>
          alert.project.id === project.id &&
          alert.category === "AGUARDANDO_ORDEM_SERVICO" &&
          alert.nextAction.code === "EMITIR_OS",
      ),
    ).toBe(true);

    const dashboardWithCommitment = await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(dashboardWithCommitment.body.pendingByStage.awaitingCommitmentNote).toBe(0);
    expect(dashboardWithCommitment.body.pendingByStage.awaitingServiceOrder).toBe(1);
    expect(
      dashboardWithCommitment.body.operationalQueue.find(
        (item: { id: string }) => item.id === project.id,
      ).nextAction.code,
    ).toBe("EMITIR_OS");
  });

  it("projects: rejects stage jumps", async () => {
    const { project } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "DIEX_REQUISITORIO",
        creditNoteNumber: "NC-001",
        diexNumber: "DIEX-001",
      })
      .expect(409);
  });

  it("diex: creates DIEx when workflow prerequisites are met", async () => {
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

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);
    expect(diex.diexNumber).toBe("DIEX-001");
  });

  it("diex: rejects creation without credit note", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await moveToCreditNote(project.id, adminAuth.accessToken);

    await request(app)
      .post("/api/diex")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        supplierCnpj: "12345678000190",
        requesterName: "Requisitante Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(409);
  });

  it("service-orders: creates OS when prerequisites are met", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
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
        commitmentNoteNumber: "NE-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const serviceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        serviceOrderNumber: "OS-001",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    expect(serviceOrder.body.serviceOrderNumber).toBe("OS-001");
  });

  it("projects timeline: aggregates audit events from related modules", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    const catalog = await createCatalog();

    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        title: "Tarefa na timeline",
      })
      .expect(201);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const archivedEstimate = await request(app)
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

    await request(app)
      .delete(`/api/estimates/${archivedEstimate.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const serviceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        diexRequestId: diex.id,
        serviceOrderNumber: "OS-TIMELINE",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    const details = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const entityTypes = details.body.timeline.map(
      (item: { entityType: string }) => item.entityType,
    );

    expect(entityTypes).toContain("PROJECT");
    expect(entityTypes).toContain("TASK");
    expect(entityTypes).toContain("ESTIMATE");
    expect(entityTypes).toContain("DIEX_REQUEST");
    expect(entityTypes).toContain("SERVICE_ORDER");

    const taskEvent = details.body.timeline.find(
      (item: { entityType: string; entityId: string }) =>
        item.entityType === "TASK" && item.entityId === task.body.id,
    );
    expect(taskEvent.context.resourceCode).toBe(`TSK-${task.body.taskCode}`);
    expect(taskEvent.context.projectId).toBe(project.id);

    const serviceOrderEvent = details.body.timeline.find(
      (item: { entityType: string; entityId: string }) =>
        item.entityType === "SERVICE_ORDER" && item.entityId === serviceOrder.body.id,
    );
    expect(serviceOrderEvent.context.resourceCode).toBe("OS-TIMELINE");
    expect(serviceOrderEvent.context.diexRequestId).toBe(diex.id);

    const timelineResponse = await request(app)
      .get(`/api/projects/${project.id}/timeline`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(timelineResponse.body.map((item: { entityType: string }) => item.entityType))
      .toEqual(entityTypes);

    const dossier = await request(app)
      .get(`/api/reports/projects/${project.id}/dossier`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(
      dossier.body.timelineSummary.some(
        (item: { source: string; action: string }) =>
          item.source === "AUDIT" && item.action === "DIEX_EMITIDO",
      ),
    ).toBe(true);
  });

  it("service-orders: rejects OS without commitment note and without DIEx", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await prisma.project.update({
      where: { id: project.id },
      data: { stage: "AGUARDANDO_NOTA_EMPENHO" },
    });

    await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        serviceOrderNumber: "OS-NEG",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(409);

    await prisma.project.update({
      where: { id: project.id },
      data: {
        commitmentNoteNumber: "NE-001",
        commitmentNoteReceivedAt: new Date("2026-04-02T00:00:00.000Z"),
      },
    });

    await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        serviceOrderNumber: "OS-NEG",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(409);
  });

  it("permissions: CONSULTA cannot edit own project or issue DIEx", async () => {
    const project = await createProject(consultaAuth.accessToken, "Projeto Consulta");
    await seedFinalizedEstimate(project.id);

    await request(app)
      .patch(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .send({ title: "Tentativa de edicao" })
      .expect(403);

    await request(app)
      .post("/api/diex")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: "not-used",
        supplierCnpj: "12345678000190",
      })
      .expect(403);
  });

  it("permissions: CONSULTA cannot export reports or access executive dashboard", async () => {
    await request(app)
      .get("/api/exports/projects.xlsx")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .get("/api/dashboard/executive")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(200);
  });

  it("permissions: catalog and OM writes use granular permissions", async () => {
    expect(adminAuth.user.permissions).toContain("atas.manage");
    expect(adminAuth.user.permissions).toContain("military_organizations.manage");
    expect(gestorAuth.user.permissions).not.toContain("atas.manage");
    expect(gestorAuth.user.permissions).not.toContain("military_organizations.manage");
    expect(projetistaAuth.user.permissions).not.toContain("atas.manage");
    expect(consultaAuth.user.permissions).not.toContain("military_organizations.manage");

    await request(app)
      .post("/api/atas")
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .send({})
      .expect(403)
      .expect((response) => {
        expect(response.body.requiredPermissions).toEqual(["atas.manage"]);
      });

    await request(app)
      .post("/api/military-organizations")
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .send({})
      .expect(403)
      .expect((response) => {
        expect(response.body.requiredPermissions).toEqual([
          "military_organizations.manage",
        ]);
      });

    const ata = await request(app)
      .post("/api/atas")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        number: "ATA-RBAC-001",
        type: "CFTV",
        vendorName: "Fornecedor RBAC",
        coverageGroups: [
          {
            code: "AM",
            name: "Amazonas",
            localities: [{ cityName: "Manaus", stateUf: "AM" }],
          },
        ],
      })
      .expect(201);

    expect(ata.body.number).toBe("ATA-RBAC-001");

    await request(app)
      .get("/api/atas")
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(200);

    await request(app)
      .get("/api/ata-items")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(200);

    await request(app)
      .patch(`/api/atas/${ata.body.id}`)
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .send({ notes: "tentativa gestor" })
      .expect(403);

    const om = await request(app)
      .post("/api/military-organizations")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        sigla: "OMR",
        name: "Organizacao Militar RBAC",
        cityName: "Manaus",
        stateUf: "AM",
      })
      .expect(201);

    expect(om.body.sigla).toBe("OMR");

    await request(app)
      .get("/api/military-organizations")
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(200);

    await request(app)
      .get("/api/military-organizations")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(200);

    await request(app)
      .patch(`/api/military-organizations/${om.body.id}`)
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .send({ name: "Tentativa Gestor" })
      .expect(403);
  });

  it("ergonomics: secondary modules expose paginated envelopes and legacy format", async () => {
    const catalog = await createCatalog();

    const users = await request(app)
      .get("/api/users")
      .query({ role: "GESTOR", pageSize: 1 })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(users.body.items).toHaveLength(1);
    expect(users.body.items[0].role).toBe("GESTOR");
    expect(users.body.meta.totalItems).toBe(1);
    expect(users.body.filters.role).toBe("GESTOR");
    expect(users.body.links.self).toContain("/api/users");

    const legacyUsers = await request(app)
      .get("/api/users")
      .query({ format: "legacy" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(Array.isArray(legacyUsers.body)).toBe(true);

    const atas = await request(app)
      .get("/api/atas")
      .query({ search: catalog.ata.number, pageSize: 1 })
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(200);

    expect(atas.body.items).toHaveLength(1);
    expect(atas.body.items[0].id).toBe(catalog.ata.id);
    expect(atas.body.filters.search).toBe(catalog.ata.number);

    const ataItems = await request(app)
      .get(`/api/atas/${catalog.ata.id}/items`)
      .query({ format: "envelope", pageSize: 1 })
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(200);

    expect(ataItems.body.items).toHaveLength(1);
    expect(ataItems.body.items[0].id).toBe(catalog.ataItem.id);
    expect(ataItems.body.meta.totalItems).toBe(1);

    const legacyAtaItems = await request(app)
      .get("/api/ata-items")
      .query({ format: "legacy" })
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(200);

    expect(Array.isArray(legacyAtaItems.body)).toBe(true);

    const oms = await request(app)
      .get("/api/military-organizations")
      .query({ sigla: catalog.om.sigla })
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(200);

    expect(oms.body.items).toHaveLength(1);
    expect(oms.body.items[0].id).toBe(catalog.om.id);
    expect(oms.body.filters.sigla).toBe(catalog.om.sigla);
  });

  it("permissions: applies granular task and estimate permissions", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto RBAC granular");
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: projetista.id,
        role: "Projetista",
      },
    });

    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .send({
        projectId: project.id,
        title: "Tarefa atribuida sem permissao",
        assigneeId: projetista.id,
      })
      .expect(403);

    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .send({
        projectId: project.id,
        title: "Tarefa operacional",
      })
      .expect(201);

    await request(app)
      .patch(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ assigneeId: projetista.id })
      .expect(200);

    await request(app)
      .patch(`/api/tasks/${task.body.id}/status`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .send({ status: "CONCLUIDA" })
      .expect(200);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    const catalog = await createCatalog();

    await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .send({
        projectId: project.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 1 }],
      })
      .expect(403);

    const estimate = await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .send({
        projectId: project.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 1 }],
      })
      .expect(201);

    await request(app)
      .patch(`/api/estimates/${estimate.body.id}/status`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .send({ status: "FINALIZADA" })
      .expect(200);

    await request(app)
      .delete(`/api/estimates/${estimate.body.id}`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);
  });

  it("tasks archive: hides archived tasks by default, restores and updates open task summary", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto Task Archive");

    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        title: "Tarefa a arquivar",
      })
      .expect(201);

    const detailsBeforeArchive = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsBeforeArchive.body.operationalSummary.openTasksCount).toBe(1);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("tasks.archive");
        expect(response.body.task.archivedAt).toBeTruthy();
      });

    const defaultTasks = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(defaultTasks.body.meta.totalItems).toBe(0);
    expect(defaultTasks.body.items.some((item: { id: string }) => item.id === task.body.id)).toBe(false);

    const detailsAfterArchive = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsAfterArchive.body.operationalSummary.openTasksCount).toBe(0);

    const archivedTasks = await request(app)
      .get("/api/tasks")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(archivedTasks.body.filters.onlyArchived).toBe(true);
    expect(archivedTasks.body.items.some((item: { id: string; archivedAt: string | null }) => item.id === task.body.id && item.archivedAt)).toBe(true);

    await request(app)
      .post(`/api/tasks/${task.body.id}/restore`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .post(`/api/tasks/${task.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("tasks.restore");
        expect(response.body.task.archivedAt).toBeNull();
      });

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "TASK", entityId: task.body.id, action: "RESTORE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("estimates archive: hides archived estimates by default, restores and updates financial summary", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto Estimate Archive");
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

    const detailsBeforeArchive = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsBeforeArchive.body.financialSummary.estimatesCount).toBe(1);
    expect(detailsBeforeArchive.body.financialSummary.estimatedTotalAmount).toBe("100.00");

    await request(app)
      .delete(`/api/estimates/${estimate.body.id}`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .delete(`/api/estimates/${estimate.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("estimates.archive");
        expect(response.body.estimate.archivedAt).toBeTruthy();
      });

    const defaultEstimates = await request(app)
      .get("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(defaultEstimates.body.meta.totalItems).toBe(0);
    expect(defaultEstimates.body.items.some((item: { id: string }) => item.id === estimate.body.id)).toBe(false);

    const detailsAfterArchive = await request(app)
      .get(`/api/projects/${project.id}/details`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(detailsAfterArchive.body.financialSummary.estimatesCount).toBe(0);
    expect(detailsAfterArchive.body.financialSummary.estimatedTotalAmount).toBe("0.00");

    const archivedEstimates = await request(app)
      .get("/api/estimates")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(archivedEstimates.body.filters.onlyArchived).toBe(true);
    expect(archivedEstimates.body.items.some((item: { id: string; archivedAt: string | null }) => item.id === estimate.body.id && item.archivedAt)).toBe(true);

    await request(app)
      .post(`/api/estimates/${estimate.body.id}/restore`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .post(`/api/estimates/${estimate.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("estimates.restore");
        expect(response.body.estimate.archivedAt).toBeNull();
      });

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "ESTIMATE", entityId: estimate.body.id, action: "RESTORE" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("restore permissions: GESTOR can restore and PROJETISTA/CONSULTA cannot", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    const archivedProject = await createProject(adminAuth.accessToken, "Projeto Arquivado");

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

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const serviceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        serviceOrderNumber: "OS-001",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    // Arquivar na ordem correta
    await request(app)
      .delete(`/api/service-orders/${serviceOrder.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/api/diex/${diex.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/api/projects/${archivedProject.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .post(`/api/projects/${archivedProject.id}/restore`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .post(`/api/projects/${archivedProject.id}/restore`)
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("projects.restore");
      });

    await request(app)
      .post(`/api/diex/${diex.id}/restore`)
      .set("Authorization", `Bearer ${consultaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .post(`/api/diex/${diex.id}/restore`)
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("diex.restore");
      });

    await request(app)
      .post(`/api/service-orders/${serviceOrder.body.id}/restore`)
      .set("Authorization", `Bearer ${projetistaAuth.accessToken}`)
      .expect(403);

    await request(app)
      .post(`/api/service-orders/${serviceOrder.body.id}/restore`)
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("service_orders.restore");
      });
  });

  it("restore cascade: project can restore eligible archived children and skip logically deleted ones", async () => {
    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await moveToCreditNote(project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-CASCADE-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: project.id, title: "Tarefa restauravel em cascata" })
      .expect(201);

    const deletedTask = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: project.id, title: "Tarefa removida logicamente" })
      .expect(201);

    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-CASCADE-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const serviceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        diexId: diex.id,
        serviceOrderNumber: "OS-CASCADE-001",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Cascade",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await request(app)
      .delete(`/api/service-orders/${serviceOrder.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/api/diex/${diex.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const lifecycleDate = new Date("2026-04-10T00:00:00.000Z");

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: {
        archivedAt: lifecycleDate,
      },
    });

    await prisma.task.update({
      where: { id: deletedTask.body.id },
      data: {
        archivedAt: lifecycleDate,
        deletedAt: lifecycleDate,
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        archivedAt: lifecycleDate,
      },
    });

    await request(app)
      .post(`/api/projects/${project.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ cascade: true })
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("projects.restore");
        expect(response.body.cascadeApplied).toBe(true);
        expect(response.body.project.archivedAt).toBeNull();
        expect(response.body.cascade.restored).toEqual({
          tasks: 1,
          estimates: 1,
          diexRequests: 1,
          serviceOrders: 1,
        });
        expect(response.body.cascade.skipped.tasksDeleted).toBe(1);
      });

    const [restoredTask, logicallyDeletedTask, restoredEstimate, restoredDiex, restoredServiceOrder] =
      await Promise.all([
        prisma.task.findUnique({ where: { id: task.body.id } }),
        prisma.task.findUnique({ where: { id: deletedTask.body.id } }),
        prisma.estimate.findUnique({ where: { id: estimate.id } }),
        prisma.diexRequest.findUnique({ where: { id: diex.id } }),
        prisma.serviceOrder.findUnique({ where: { id: serviceOrder.body.id } }),
      ]);

    expect(restoredTask?.archivedAt).toBeNull();
    expect(restoredEstimate?.archivedAt).toBeNull();
    expect(restoredDiex?.archivedAt).toBeNull();
    expect(restoredServiceOrder?.archivedAt).toBeNull();
    expect(logicallyDeletedTask?.deletedAt).toBeTruthy();
    expect(logicallyDeletedTask?.archivedAt).toBeTruthy();
  });

  it("restore cascade: service order can restore archived dependency chain, but blocks logical deletes", async () => {
    const firstChain = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await moveToCreditNote(firstChain.project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${firstChain.project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-SO-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const firstDiex = await issueDiex(
      firstChain.project.id,
      firstChain.estimate.id,
      adminAuth.accessToken,
    );

    await request(app)
      .patch(`/api/projects/${firstChain.project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-SO-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const firstServiceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: firstChain.project.id,
        estimateId: firstChain.estimate.id,
        diexId: firstDiex.id,
        serviceOrderNumber: "OS-UP-001",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Restore",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await request(app)
      .delete(`/api/service-orders/${firstServiceOrder.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/api/diex/${firstDiex.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const firstLifecycleDate = new Date("2026-04-15T00:00:00.000Z");

    await prisma.estimate.update({
      where: { id: firstChain.estimate.id },
      data: {
        archivedAt: firstLifecycleDate,
      },
    });

    await prisma.project.update({
      where: { id: firstChain.project.id },
      data: {
        archivedAt: firstLifecycleDate,
      },
    });

    await request(app)
      .post(`/api/service-orders/${firstServiceOrder.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(409);

    await request(app)
      .post(`/api/service-orders/${firstServiceOrder.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ cascade: true })
      .expect(200)
      .expect((response) => {
        expect(response.body.permissionUsed).toBe("service_orders.restore");
        expect(response.body.cascadeApplied).toBe(true);
        expect(response.body.serviceOrder.archivedAt).toBeNull();
      });

    const [restoredProject, restoredEstimate, restoredDiex, restoredServiceOrder] =
      await Promise.all([
        prisma.project.findUnique({ where: { id: firstChain.project.id } }),
        prisma.estimate.findUnique({ where: { id: firstChain.estimate.id } }),
        prisma.diexRequest.findUnique({ where: { id: firstDiex.id } }),
        prisma.serviceOrder.findUnique({ where: { id: firstServiceOrder.body.id } }),
      ]);

    expect(restoredProject?.archivedAt).toBeNull();
    expect(restoredEstimate?.archivedAt).toBeNull();
    expect(restoredDiex?.archivedAt).toBeNull();
    expect(restoredServiceOrder?.archivedAt).toBeNull();

    const secondChain = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await moveToCreditNote(secondChain.project.id, adminAuth.accessToken);

    await request(app)
      .patch(`/api/projects/${secondChain.project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-SO-002",
        creditNoteReceivedAt: "2026-04-11T00:00:00.000Z",
      })
      .expect(200);

    const secondDiex = await issueDiex(
      secondChain.project.id,
      secondChain.estimate.id,
      adminAuth.accessToken,
    );

    await request(app)
      .patch(`/api/projects/${secondChain.project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-SO-002",
        commitmentNoteReceivedAt: "2026-04-12T00:00:00.000Z",
      })
      .expect(200);

    const secondServiceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: secondChain.project.id,
        estimateId: secondChain.estimate.id,
        diexId: secondDiex.id,
        serviceOrderNumber: "OS-UP-002",
        issuedAt: "2026-04-13T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Block",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await request(app)
      .delete(`/api/service-orders/${secondServiceOrder.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await prisma.diexRequest.update({
      where: { id: secondDiex.id },
      data: {
        archivedAt: new Date("2026-04-20T00:00:00.000Z"),
        deletedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
    });

    await request(app)
      .post(`/api/service-orders/${secondServiceOrder.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ cascade: true })
      .expect(409);
  });

  it("archive filters: admin can include or isolate archived records", async () => {
    const activeProject = await createProject(adminAuth.accessToken, "Projeto Ativo");
    const archivedProject = await createProject(adminAuth.accessToken, "Projeto Arquivado");

    await request(app)
      .delete(`/api/projects/${archivedProject.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const projectForTasks = await createProject(adminAuth.accessToken, "Projeto Filtros Tarefas");
    const activeTask = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: projectForTasks.id, title: "Tarefa ativa" })
      .expect(201);
    const archivedTask = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: projectForTasks.id, title: "Tarefa arquivada" })
      .expect(201);

    await request(app)
      .delete(`/api/tasks/${archivedTask.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const projectForEstimates = await createProject(adminAuth.accessToken, "Projeto Filtros Estimativas");
    const catalog = await createCatalog();
    const activeEstimate = await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: projectForEstimates.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 1 }],
      })
      .expect(201);
    const archivedEstimate = await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: projectForEstimates.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 2 }],
      })
      .expect(201);

    await request(app)
      .delete(`/api/estimates/${archivedEstimate.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const projectsWithArchived = await request(app)
      .get("/api/projects")
      .query({ includeArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(projectsWithArchived.body.filters.includeArchived).toBe(true);
    expect(
      projectsWithArchived.body.items.some((item: { id: string }) => item.id === activeProject.id),
    ).toBe(true);
    expect(
      projectsWithArchived.body.items.some(
        (item: {
          id: string;
          archivedAt: string | null;
          archiveContext?: { actorUserId: string | null };
        }) =>
          item.id === archivedProject.id &&
          item.archivedAt &&
          item.archiveContext?.actorUserId === admin.id,
      ),
    ).toBe(true);

    const archivedProjectsOnly = await request(app)
      .get("/api/projects")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(archivedProjectsOnly.body.filters.onlyArchived).toBe(true);
    expect(
      archivedProjectsOnly.body.items.every((item: { archivedAt: string | null }) =>
        Boolean(item.archivedAt),
      ),
    ).toBe(true);

    await request(app)
      .get("/api/projects")
      .query({ includeArchived: true })
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(403);

    const tasksWithArchived = await request(app)
      .get("/api/tasks")
      .query({ includeArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(tasksWithArchived.body.filters.includeArchived).toBe(true);
    expect(
      tasksWithArchived.body.items.some((item: { id: string }) => item.id === activeTask.body.id),
    ).toBe(true);
    expect(
      tasksWithArchived.body.items.some(
        (item: {
          id: string;
          archivedAt: string | null;
          archiveContext?: { actorUserId: string | null; summary: string | null };
        }) =>
          item.id === archivedTask.body.id &&
          item.archivedAt &&
          item.archiveContext?.actorUserId === admin.id &&
          item.archiveContext.summary?.includes("arquivada"),
      ),
    ).toBe(true);

    const tasksArchivedByPeriod = await request(app)
      .get("/api/tasks")
      .query({
        archivedFrom: "2000-01-01T00:00:00.000Z",
        archivedUntil: "2999-12-31T23:59:59.999Z",
      })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(tasksArchivedByPeriod.body.filters.archivedFrom).toBeDefined();
    expect(
      tasksArchivedByPeriod.body.items.every((item: { archivedAt: string | null }) =>
        Boolean(item.archivedAt),
      ),
    ).toBe(true);

    await request(app)
      .get("/api/tasks")
      .query({ archivedFrom: "2000-01-01T00:00:00.000Z" })
      .set("Authorization", `Bearer ${gestorAuth.accessToken}`)
      .expect(403);

    const estimatesOnlyArchived = await request(app)
      .get("/api/estimates")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(estimatesOnlyArchived.body.filters.onlyArchived).toBe(true);
    expect(
      estimatesOnlyArchived.body.items.some(
        (item: {
          id: string;
          archivedAt: string | null;
          archiveContext?: { actorUserId: string | null };
        }) =>
          item.id === archivedEstimate.body.id &&
          item.archivedAt &&
          item.archiveContext?.actorUserId === admin.id,
      ),
    ).toBe(true);
    expect(
      estimatesOnlyArchived.body.items.some(
        (item: { id: string }) => item.id === activeEstimate.body.id,
      ),
    ).toBe(false);

    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);
    const diex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const serviceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        serviceOrderNumber: "OS-ARCHIVE-FILTER",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Teste",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await request(app)
      .delete(`/api/service-orders/${serviceOrder.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    await request(app)
      .delete(`/api/diex/${diex.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const archivedServiceOrders = await request(app)
      .get("/api/service-orders")
      .query({ onlyArchived: true, archivedFrom: "2000-01-01T00:00:00.000Z" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(
      archivedServiceOrders.body.items.some(
        (item: {
          id: string;
          archivedAt: string | null;
          archiveContext?: { actorUserId: string | null };
        }) =>
          item.id === serviceOrder.body.id &&
          item.archivedAt &&
          item.archiveContext?.actorUserId === admin.id,
      ),
    ).toBe(true);

    const archivedDiex = await request(app)
      .get("/api/diex")
      .query({ onlyArchived: true, archivedUntil: "2999-12-31T23:59:59.999Z" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(
      archivedDiex.body.items.some(
        (item: {
          id: string;
          archivedAt: string | null;
          archiveContext?: { actorUserId: string | null };
        }) =>
          item.id === diex.id &&
          item.archivedAt &&
          item.archiveContext?.actorUserId === admin.id,
      ),
    ).toBe(true);
  });

  it("logical delete filters: deleted records stay out of default and archived views, but can be isolated administratively", async () => {
    const deletedProject = await createProject(adminAuth.accessToken, "Projeto Deleted");
    await prisma.project.update({
      where: { id: deletedProject.id },
      data: {
        archivedAt: new Date("2026-04-20T00:00:00.000Z"),
        deletedAt: new Date("2026-04-21T00:00:00.000Z"),
      },
    });

    const taskProject = await createProject(adminAuth.accessToken, "Projeto Deleted Task");
    const deletedTask = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: taskProject.id, title: "Tarefa deleted" })
      .expect(201);
    await prisma.task.update({
      where: { id: deletedTask.body.id },
      data: {
        archivedAt: new Date("2026-04-20T00:00:00.000Z"),
        deletedAt: new Date("2026-04-21T00:00:00.000Z"),
      },
    });

    const estimateProject = await createProject(adminAuth.accessToken, "Projeto Deleted Estimate");
    const catalog = await createCatalog();
    const deletedEstimate = await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: estimateProject.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 1 }],
      })
      .expect(201);
    await prisma.estimate.update({
      where: { id: deletedEstimate.body.id },
      data: {
        archivedAt: new Date("2026-04-20T00:00:00.000Z"),
        deletedAt: new Date("2026-04-21T00:00:00.000Z"),
      },
    });

    const { project, estimate } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-DELETE-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const deletedDiex = await issueDiex(project.id, estimate.id, adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${project.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-DELETE-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const deletedServiceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: project.id,
        estimateId: estimate.id,
        serviceOrderNumber: "OS-DELETE-001",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Delete",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await prisma.diexRequest.update({
      where: { id: deletedDiex.id },
      data: {
        archivedAt: new Date("2026-04-20T00:00:00.000Z"),
        deletedAt: new Date("2026-04-21T00:00:00.000Z"),
      },
    });
    await prisma.serviceOrder.update({
      where: { id: deletedServiceOrder.body.id },
      data: {
        archivedAt: new Date("2026-04-20T00:00:00.000Z"),
        deletedAt: new Date("2026-04-21T00:00:00.000Z"),
      },
    });

    const defaultProjects = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(defaultProjects.body.items.some((item: { id: string }) => item.id === deletedProject.id)).toBe(false);

    const archivedProjects = await request(app)
      .get("/api/projects")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(archivedProjects.body.items.some((item: { id: string }) => item.id === deletedProject.id)).toBe(false);

    const deletedProjects = await request(app)
      .get("/api/projects")
      .query({ onlyDeleted: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(deletedProjects.body.filters.onlyDeleted).toBe(true);
    expect(deletedProjects.body.items.some((item: { id: string; deletedAt: string | null }) => item.id === deletedProject.id && item.deletedAt)).toBe(true);

    const archivedTasks = await request(app)
      .get("/api/tasks")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(archivedTasks.body.items.some((item: { id: string }) => item.id === deletedTask.body.id)).toBe(false);

    const deletedTasks = await request(app)
      .get("/api/tasks")
      .query({ onlyDeleted: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(deletedTasks.body.items.some((item: { id: string; deletedAt: string | null }) => item.id === deletedTask.body.id && item.deletedAt)).toBe(true);

    const archivedEstimates = await request(app)
      .get("/api/estimates")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(archivedEstimates.body.items.some((item: { id: string }) => item.id === deletedEstimate.body.id)).toBe(false);

    const deletedEstimates = await request(app)
      .get("/api/estimates")
      .query({ onlyDeleted: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(deletedEstimates.body.items.some((item: { id: string; deletedAt: string | null }) => item.id === deletedEstimate.body.id && item.deletedAt)).toBe(true);

    const archivedDiex = await request(app)
      .get("/api/diex")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(archivedDiex.body.items.some((item: { id: string }) => item.id === deletedDiex.id)).toBe(false);

    const deletedDiexList = await request(app)
      .get("/api/diex")
      .query({ onlyDeleted: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(deletedDiexList.body.items.some((item: { id: string; deletedAt: string | null }) => item.id === deletedDiex.id && item.deletedAt)).toBe(true);

    const archivedServiceOrders = await request(app)
      .get("/api/service-orders")
      .query({ onlyArchived: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(archivedServiceOrders.body.items.some((item: { id: string }) => item.id === deletedServiceOrder.body.id)).toBe(false);

    const deletedServiceOrders = await request(app)
      .get("/api/service-orders")
      .query({ onlyDeleted: true })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(deletedServiceOrders.body.items.some((item: { id: string; deletedAt: string | null }) => item.id === deletedServiceOrder.body.id && item.deletedAt)).toBe(true);

    await request(app)
      .post(`/api/projects/${deletedProject.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(404);
    await request(app)
      .post(`/api/tasks/${deletedTask.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(404);
    await request(app)
      .post(`/api/estimates/${deletedEstimate.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(404);
    await request(app)
      .post(`/api/diex/${deletedDiex.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(404);
    await request(app)
      .post(`/api/service-orders/${deletedServiceOrder.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(404);
  });

  it("logical delete on project parent hides active child records from operational reads", async () => {
    const { project: activeProject, estimate: finalizedEstimate } =
      await createProjectWithFinalizedEstimate(adminAuth.accessToken, "Projeto Pai Deleted");
    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: activeProject.id, title: "Tarefa do projeto deletado" })
      .expect(201);

    await request(app)
      .patch(`/api/projects/${activeProject.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_CREDITO",
        creditNoteNumber: "NC-PARENT-001",
        creditNoteReceivedAt: "2026-04-01T00:00:00.000Z",
      })
      .expect(200);

    const diex = await issueDiex(activeProject.id, finalizedEstimate.id, adminAuth.accessToken);
    await request(app)
      .patch(`/api/projects/${activeProject.id}/flow`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        stage: "AGUARDANDO_NOTA_EMPENHO",
        commitmentNoteNumber: "NE-PARENT-001",
        commitmentNoteReceivedAt: "2026-04-02T00:00:00.000Z",
      })
      .expect(200);

    const serviceOrder = await request(app)
      .post("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: activeProject.id,
        estimateId: finalizedEstimate.id,
        serviceOrderNumber: "OS-PARENT-001",
        issuedAt: "2026-04-03T00:00:00.000Z",
        contractorCnpj: "12345678000190",
        requesterName: "Fiscal Parent",
        requesterRank: "2 Ten",
        requesterCpf: "11122233344",
      })
      .expect(201);

    await prisma.project.update({
      where: { id: activeProject.id },
      data: {
        deletedAt: new Date("2026-04-22T00:00:00.000Z"),
      },
    });

    const tasks = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(tasks.body.items.some((item: { id: string }) => item.id === task.body.id)).toBe(false);

    const estimates = await request(app)
      .get("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(estimates.body.items.some((item: { id: string }) => item.id === finalizedEstimate.id)).toBe(false);

    const diexList = await request(app)
      .get("/api/diex")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(diexList.body.items.some((item: { id: string }) => item.id === diex.id)).toBe(false);

    const serviceOrders = await request(app)
      .get("/api/service-orders")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    expect(serviceOrders.body.items.some((item: { id: string }) => item.id === serviceOrder.body.id)).toBe(false);
  });

  it("archive/restore: rejects invalid repeated operations and parent archive conflicts", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto Conflitos Archive");
    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: project.id, title: "Tarefa com conflitos" })
      .expect(201);

    await request(app)
      .post(`/api/tasks/${task.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(409);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(409);

    await request(app)
      .post(`/api/tasks/${task.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await request(app)
      .post(`/api/tasks/${task.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(409);

    const estimateProject = await createProject(adminAuth.accessToken, "Projeto Estimativa Pai");
    const catalog = await createCatalog();
    const estimate = await request(app)
      .post("/api/estimates")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({
        projectId: estimateProject.id,
        ataId: catalog.ata.id,
        coverageGroupId: catalog.coverageGroup.id,
        omId: catalog.om.id,
        items: [{ ataItemId: catalog.ataItem.id, quantity: 1 }],
      })
      .expect(201);

    await request(app)
      .delete(`/api/estimates/${estimate.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    await prisma.project.update({
      where: { id: estimateProject.id },
      data: { archivedAt: new Date() },
    });

    await request(app)
      .post(`/api/estimates/${estimate.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(409);
  });

  it("dashboards: applies manual, monthly and invalid temporal filters", async () => {
    const january = await createProjectWithFinalizedEstimate(
      adminAuth.accessToken,
    );
    const february = await createProjectWithFinalizedEstimate(
      adminAuth.accessToken,
    );

    await setProjectAndEstimateCreatedAt(
      january.project.id,
      january.estimate.id,
      new Date("2026-01-10T12:00:00.000Z"),
    );
    await setProjectAndEstimateCreatedAt(
      february.project.id,
      february.estimate.id,
      new Date("2026-02-10T12:00:00.000Z"),
    );

    const overview = await request(app)
      .get("/api/dashboard")
      .query({
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
      })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(overview.body.filter.mode).toBe("interval");
    expect(overview.body.totals.projects).toBe(1);
    expect(overview.body.totals.estimates).toBe(1);
    expect(overview.body.financial.totalEstimatedAmount).toBe("200.00");

    const executive = await request(app)
      .get("/api/dashboard/executive")
      .query({ periodType: "month", referenceDate: "2026-02-15T00:00:00.000Z" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(executive.body.filter.mode).toBe("interval");
    expect(executive.body.filter.periodType).toBe("month");
    expect(executive.body.summary.projectsTotal).toBe(1);
    expect(executive.body.summary.totalEstimatedAmount).toBe("200.00");

    await request(app)
      .get("/api/dashboard/executive")
      .query({
        asOfDate: "2026-02-15T00:00:00.000Z",
        periodType: "month",
      })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(400);
  });

  it("audit: stores archive and restore metadata with before/after snapshots", async () => {
    const project = await createProject(adminAuth.accessToken, "Projeto Auditoria Archive");
    const task = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .send({ projectId: project.id, title: "Tarefa auditada" })
      .expect(201);

    await request(app)
      .delete(`/api/tasks/${task.body.id}`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const archiveAudit = await prisma.auditLog.findFirst({
      where: { entityType: "TASK", entityId: task.body.id, action: "ARCHIVE" },
      orderBy: { createdAt: "desc" },
    });

    expect(archiveAudit?.actorUserId).toBe(admin.id);
    expect(archiveAudit?.summary).toContain("arquivada");
    expect((archiveAudit?.metadata as Record<string, unknown>).permissionUsed).toBe(
      "tasks.archive",
    );
    expect((archiveAudit?.beforeJson as Record<string, unknown>).archivedAt).toBeNull();
    expect((archiveAudit?.afterJson as Record<string, unknown>).archivedAt).toBeTruthy();

    await request(app)
      .post(`/api/tasks/${task.body.id}/restore`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    const restoreAudit = await prisma.auditLog.findFirst({
      where: { entityType: "TASK", entityId: task.body.id, action: "RESTORE" },
      orderBy: { createdAt: "desc" },
    });

    expect(restoreAudit?.actorUserId).toBe(admin.id);
    expect((restoreAudit?.metadata as Record<string, unknown>).permissionUsed).toBe(
      "tasks.restore",
    );
    expect((restoreAudit?.beforeJson as Record<string, unknown>).archivedAt).toBeTruthy();
    expect((restoreAudit?.afterJson as Record<string, unknown>).archivedAt).toBeNull();
  });

  it("global search and dashboards return grouped operational data", async () => {
    await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    const search = await request(app)
      .get("/api/search")
      .query({ q: "Manaus" })
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(search.body.groups.projects.length).toBeGreaterThanOrEqual(1);

    const operational = await request(app)
      .get("/api/dashboard/operational")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(operational.body.alerts.summary).toBeDefined();

    const executive = await request(app)
      .get("/api/dashboard/executive")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(executive.body.summary.projectsTotal).toBeGreaterThanOrEqual(1);
  });

  it("exports and reports expose authorized project outputs", async () => {
    const { project } = await createProjectWithFinalizedEstimate(adminAuth.accessToken);

    const xlsx = await request(app)
      .get("/api/exports/projects.xlsx")
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(xlsx.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(Buffer.isBuffer(xlsx.body)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body);
    const worksheet = workbook.getWorksheet("Projetos");
    expect(worksheet).toBeDefined();

    const headerRow = worksheet!.getRow(1);
    expect(String(headerRow.getCell(1).value).toLowerCase()).toContain("projeto");
    expect(String(headerRow.getCell(3).value).toLowerCase()).toBe("status");
    expect(String(headerRow.getCell(10).value).toLowerCase()).toContain("valor");

    const projectRow = worksheet!.getRows(2, worksheet!.rowCount - 1)?.find((row) =>
      row.values.toString().includes(project.title),
    );

    expect(projectRow).toBeDefined();
    expect(projectRow!.getCell(1).value).toBe(`PRJ-${project.projectCode}`);
    expect(projectRow!.getCell(2).value).toBe(project.title);
    expect(String(projectRow!.getCell(6).value)).toContain("OMT");
    expect(projectRow!.getCell(7).value).toBe("Manaus");
    expect(projectRow!.getCell(10).value).toBe(200);

    const dossier = await request(app)
      .get(`/api/reports/projects/${project.id}/dossier`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(dossier.body.project.id).toBe(project.id);
    expect(Array.isArray(dossier.body.timelineSummary)).toBe(true);

    const pdf = await request(app)
      .get(`/api/reports/projects/${project.id}/dossier.pdf`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(Buffer.isBuffer(pdf.body)).toBe(true);
    expect(pdf.body.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdf.body.length).toBeGreaterThan(1000);
  });
});
