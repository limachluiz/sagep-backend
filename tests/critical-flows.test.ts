import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/config/prisma.js";
import { hashToken } from "../src/shared/auth-tokens.js";

const password = "123456";

type TestUser = {
  id: string;
  email: string;
  role: "ADMIN" | "GESTOR" | "PROJETISTA" | "CONSULTA";
};

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "RefreshToken",
      "ServiceOrderDeliveredDocument",
      "ServiceOrderScheduleItem",
      "ServiceOrderItem",
      "ServiceOrder",
      "DiexRequestItem",
      "DiexRequest",
      "EstimateItem",
      "Estimate",
      "Task",
      "ProjectMember",
      "Project",
      "AtaItem",
      "AtaCoverageLocality",
      "AtaCoverageGroup",
      "Ata",
      "MilitaryOrganization",
      "User"
    RESTART IDENTITY CASCADE;
  `);
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

async function login(email: string) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);

  return response.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; role: string };
  };
}

async function createCatalog() {
  const ata = await prisma.ata.create({
    data: {
      number: "ATA-TESTE-001",
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
      sigla: "OMT",
      name: "Organizacao Militar Teste",
      cityName: "Manaus",
      stateUf: "AM",
      isActive: true,
    },
  });

  return { ata, coverageGroup, ataItem, om };
}

async function createProject(token: string, title = "Projeto CFTV Manaus") {
  const response = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, description: "Projeto de teste" })
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
      .expect(200);

    expect(xlsx.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    const dossier = await request(app)
      .get(`/api/reports/projects/${project.id}/dossier`)
      .set("Authorization", `Bearer ${adminAuth.accessToken}`)
      .expect(200);

    expect(dossier.body.project.id).toBe(project.id);
    expect(Array.isArray(dossier.body.timelineSummary)).toBe(true);
  });
});
