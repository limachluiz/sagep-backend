import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client.js";
import {
  allPermissions,
  allRoles,
  permissionDescriptions,
  rolePermissions,
} from "../src/modules/permissions/permissions.catalog.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

type SeedMode = "dev" | "demo";

const DEMO_TAG = "[SEED-DEMO]";

const users = [
  {
    name: "Luiz Henrique Chagas de Lima",
    email: "admin@sagep.com",
    password: "123456",
    role: "ADMIN" as const,
    rank: "2º Ten",
    cpf: "96208023220",
  },
  {
    name: "Gestor SAGEP",
    email: "gestor@sagep.com",
    password: "123456",
    role: "GESTOR" as const,
    rank: "Cap",
    cpf: "11111111111",
  },
  {
    name: "Projetista 01",
    email: "projetista@sagep.com",
    password: "123456",
    role: "PROJETISTA" as const,
    rank: "1º Ten",
    cpf: "22222222222",
  },
  {
    name: "Usuário Consulta",
    email: "consulta@sagep.com",
    password: "123456",
    role: "CONSULTA" as const,
    rank: null,
    cpf: null,
  },
];

// MANTENHA aqui o seu array "oms" atual exatamente como já está hoje.
const oms = [
  { sigla: "16ª Ba Log", name: "16ª BASE LOGISTICA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "4º B Av Ex", name: "4º BATALHAO DE AVIACAO DO EXERCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "5º BEC", name: "5º BATALHAO DE ENGENHARIA DE CONSTRUCAO", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "6º BEC", name: "6º BATALHAO DE ENGENHARIA DE CONSTRUCAO", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "7º BEC", name: "7º BATALHAO DE ENGENHARIA DE CONSTRUCAO", cityName: "Rio Branco", stateUf: "AC" },
  { sigla: "Nu 1ª B Com GE Sl", name: "Núcleo do 1º Batalhão de Comunicações e Guerra Eletrônica de Selva", cityName: "Manaus", stateUf: "AM" },
  { sigla: "1º BIS (Amv)", name: "1º BATALHAO DE INFANTARIA DE SELVA (AEROMOVEL)", cityName: "Manaus", stateUf: "AM" },
  { sigla: "3º BIS", name: "3º BATALHAO DE INFANTARIA DE SELVA", cityName: "Barcelos", stateUf: "AM" },
  { sigla: "17º BIS", name: "17º BATALHAO DE INFANTARIA DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "54º BIS", name: "54º BATALHAO DE INFANTARIA DE SELVA", cityName: "Humaitá", stateUf: "AM" },
  { sigla: "1º B Log Sl", name: "1ª BATALHAO LOGISTICO DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "7º BPE", name: "7º BATALHAO DE POLICIA DO EXERCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "2º B Log Sl", name: "2º BATALHÃO LOGÍSTICO DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "17º B Log Sl", name: "17º Batalhão Logístico de Selva", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "12º B Sup", name: "12º BATALHAO DE SUPRIMENTO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "12º GAAAe Sl", name: "12º GRUPO DE ARTILHARIA ANTIAEREA DE SELVA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "4º CTA", name: "4º CENTRO DE TELEMATICA DE AREA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CECMA", name: "CENTRO DE EMBARCACOES DO COMANDO MILITAR DA AMAZONIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CFR-Manaus", name: "CENTRO DE FORMAÇÃO DE RESERVISTA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CIGS", name: "CENTRO DE INSTRUCAO DE GUERRA NA SELVA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CMM", name: "COLEGIO MILITAR DE MANAUS", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo Fron-AC/4º BIS", name: "COMANDO DE FRONTEIRA DO ACRE / 4º BATALHAO DE INFANTARIA DE SELVA", cityName: "Rio Branco", stateUf: "AC" },
  { sigla: "Cmdo Fron-RN/5º BIS", name: "COMANDO DE FRONTEIRA RIO NEGRO / 5º BATALHAO DE INFANTARIA DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "Cmdo Fron-RO/6º BIS", name: "COMANDO DE FRONTEIRA DE RONDONIA / 6º BATALHAO DE INFANTARIA DE SELVA", cityName: "Guajará-Mirim", stateUf: "RO" },
  { sigla: "Cmdo Fron-RR/7º BIS", name: "COMANDO DE FRONTEIRA RORAIMA / 7º BATALHAO DE INFANTARIA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "Cmdo Fron-Sol/8º BIS", name: "COMANDO DE FRONTEIRA SOLIMOES E 8º BATALHAO DE INFANTARIA DE SELVA", cityName: "Tabatinga", stateUf: "AM" },
  { sigla: "Cmdo Fron-Juruá/61º BIS", name: "COMANDO DE FRONTEIRA JURUA/ 61º BATALHAO DE INFANTARIA DE SELVA", cityName: "Cruzeiro do Sul", stateUf: "AC" },
  { sigla: "Cmdo CMA", name: "COMANDO MILITAR DA AMAZÔNIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo 2º Gpt E", name: "2º GRUPAMENTO DE ENGENHARIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo 1ª Bda Inf SI", name: "COMANDO 1ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "Cmdo 2ª Bda Inf Sl", name: "2ª BRIGADA DE INFANTARIA DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "Cmdo 16ª Bda Inf SI", name: "COMANDO 16ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "Cmdo 17ª Bda Inf SI", name: "COMANDO 17ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "4º BIM", name: "4º BATALHÃO DE INTELIGÊNCIA DO EXÉRCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cmdo 12ª RM", name: "12ª REGIÃO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "CRO/12", name: "COMISSAO REGIONAL DE OBRAS DA 12ª REGIAO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C CMA", name: "COMPANHIA DE COMANDO DO COMANDO MILITAR DA AMAZONIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C 2º Gpt E", name: "COMPANHIA DE COMANDO DO 2º GRUPAMENTO DE ENGENHARIA", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C 1ª Bda Inf SI", name: "COMPANHIA DE COMANDO DA 1ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "Cia C 2ª Bda Inf Sl", name: "COMPANHIA DE COMANDO DA 2ª BRIGADA DE INFANTARIA DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "Cia C 17ª Bda Inf SI", name: "COMPANHIA DE COMANDO DA 17ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "Cia C 12ª RM", name: "COMPANHIA DE COMANDO DA 12ª REGIAO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Cia C 16ª Bda Inf SI", name: "COMPANHIA DE COMANDO DA 16ª BRIGADA DE INFANTARIA DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "17ª Cia Inf Sl", name: "17ª COMPANHIA DE INFANTARIA DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "3ª Cia F Esp", name: "3ª COMPANHIA DE FORCAS ESPECIAIS", cityName: "Manaus", stateUf: "AM" },
  { sigla: "21ª Cia E Cnst", name: "21ª COMPANHIA DE ENGENHARIA DE CONSTRUCAO", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "4º CGEO", name: "4º CENTRO DE GEOINFORMACAO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "18° R C Mec", name: "18º REGIMENTO DE CAVALARIA MECANIZADO", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "10º GAC Sl", name: "10º GRUPO DE ARTILHARIA DE CAMPANHA DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "HMAM", name: "HOSPITAL MILITAR DE AREA DE MANAUS", cityName: "Manaus", stateUf: "AM" },
  { sigla: "H Gu Porto Velho", name: "HOSPITAL DE GUARNICAO DE PORTO VELHO", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "H Gu Tabatinga", name: "HOSPITAL DE GUARNICAO DE TABATINGA", cityName: "Tabatinga", stateUf: "AM" },
  { sigla: "H Gu São Gabriel Cachoeira", name: "HOSPITAL DE GUARNICAO DE SAO GABRIEL DA CACHOEIRA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "12º CGCFEx", name: "12º CENTRO DE GESTÃO CONTABILIDADE E FINANÇAS DO EXÉRCITO", cityName: "Manaus", stateUf: "AM" },
  { sigla: "Pq R Mnt/12", name: "PARQUE REGIONAL DE MANUTENCAO DA 12º REGIAO MILITAR", cityName: "Manaus", stateUf: "AM" },
  { sigla: "1º Pel Com Sl", name: "1º PELOTAO DE COMUNICACOES DE SELVA", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "16º Pel Com Sl", name: "16º PELOTAO DE COMUNICACOES DE SELVA", cityName: "Tefé", stateUf: "AM" },
  { sigla: "17º Pel Com Sl", name: "17º PELOTAO DE COMUNICACOES DE SELVA", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "2º Pel Com Sl", name: "2º PELOTAO DE COMUNICACOES DE SELVA", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "17º Pel PE", name: "17º PELOTAO DE POLICIA DO EXERCITO", cityName: "Porto Velho", stateUf: "RO" },
  { sigla: "32º Pel PE", name: "32º PELOTAO DE POLICIA DO EXERCITO", cityName: "Boa Vista", stateUf: "RR" },
  { sigla: "34º Pel PE", name: "34º PELOTAO DE POLICIA DO EXERCITO", cityName: "Tefé", stateUf: "AM" },
  { sigla: "22º Pel PE", name: "22º PELOTAO DE POLICIA DO EXERCITO", cityName: "São Gabriel da Cachoeira", stateUf: "AM" },
  { sigla: "18º RC Mec", name: "18º Regimento de Cavalaria Mecanizado", cityName: "Boa Vista", stateUf: "RR" },
] as const;

const money = (value: number | string) => new Prisma.Decimal(value);

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function upsertUsers() {
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 10);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        active: true,
        rank: user.rank,
        cpf: user.cpf,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        active: true,
        rank: user.rank,
        cpf: user.cpf,
      },
    });
  }

  const [admin, gestor, projetista, consulta] = await Promise.all(
    users.map((user) =>
      prisma.user.findUniqueOrThrow({
        where: { email: user.email },
      }),
    ),
  );

  return { admin, gestor, projetista, consulta };
}

async function ensurePermissionCatalog() {
  for (const code of allPermissions) {
    await prisma.permission.upsert({
      where: { code },
      update: {
        description: permissionDescriptions[code],
      },
      create: {
        code,
        description: permissionDescriptions[code],
      },
    });
  }
}

async function ensureRolePermissionMatrix() {
  await prisma.rolePermission.deleteMany();

  for (const role of allRoles) {
    for (const code of rolePermissions[role]) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
        select: { id: true },
      });

      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: {
            role,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          id: `role:${role}:${code}`,
          role,
          permissionId: permission.id,
        },
      });
    }
  }
}

async function upsertOms() {
  for (const om of oms) {
    await prisma.militaryOrganization.upsert({
      where: { sigla: om.sigla },
      update: {
        name: om.name,
        cityName: om.cityName,
        stateUf: om.stateUf,
        isActive: true,
      },
      create: {
        sigla: om.sigla,
        name: om.name,
        cityName: om.cityName,
        stateUf: om.stateUf,
        isActive: true,
      },
    });
  }
}

async function ensureAta(params: {
  number: string;
  type: "CFTV" | "FIBRA_OPTICA";
  vendorName: string;
  managingAgency?: string;
  notes?: string;
  validFrom?: Date;
  validUntil?: Date;
}) {
  const existing = await prisma.ata.findFirst({
    where: {
      number: params.number,
      type: params.type,
    },
  });

  if (existing) {
    return prisma.ata.update({
      where: { id: existing.id },
      data: {
        vendorName: params.vendorName,
        managingAgency: params.managingAgency,
        notes: params.notes,
        validFrom: params.validFrom,
        validUntil: params.validUntil,
        isActive: true,
      },
    });
  }

  return prisma.ata.create({
    data: {
      number: params.number,
      type: params.type,
      vendorName: params.vendorName,
      managingAgency: params.managingAgency,
      notes: params.notes,
      validFrom: params.validFrom,
      validUntil: params.validUntil,
      isActive: true,
    },
  });
}

async function ensureCoverageGroup(params: {
  ataId: string;
  code: string;
  name: string;
  description?: string;
  localities: Array<{ cityName: string; stateUf: "AM" | "RO" | "RR" | "AC" }>;
}) {
  const group = await prisma.ataCoverageGroup.upsert({
    where: {
      ataId_code: {
        ataId: params.ataId,
        code: params.code,
      },
    },
    update: {
      name: params.name,
      description: params.description,
    },
    create: {
      ataId: params.ataId,
      code: params.code,
      name: params.name,
      description: params.description,
    },
  });

  for (const locality of params.localities) {
    await prisma.ataCoverageLocality.upsert({
      where: {
        coverageGroupId_cityName_stateUf: {
          coverageGroupId: group.id,
          cityName: locality.cityName,
          stateUf: locality.stateUf,
        },
      },
      update: {},
      create: {
        coverageGroupId: group.id,
        cityName: locality.cityName,
        stateUf: locality.stateUf,
      },
    });
  }

  return group;
}

async function ensureAtaItem(params: {
  ataId: string;
  coverageGroupId: string;
  referenceCode: string;
  description: string;
  unit: string;
  unitPrice: number | string;
  notes?: string;
}) {
  const existing = await prisma.ataItem.findFirst({
    where: {
      ataId: params.ataId,
      coverageGroupId: params.coverageGroupId,
      referenceCode: params.referenceCode,
    },
  });

  if (existing) {
    return prisma.ataItem.update({
      where: { id: existing.id },
      data: {
        description: params.description,
        unit: params.unit,
        unitPrice: money(params.unitPrice),
        notes: params.notes,
        isActive: true,
      },
    });
  }

  return prisma.ataItem.create({
    data: {
      ataId: params.ataId,
      coverageGroupId: params.coverageGroupId,
      referenceCode: params.referenceCode,
      description: params.description,
      unit: params.unit,
      unitPrice: money(params.unitPrice),
      notes: params.notes,
      isActive: true,
    },
  });
}

async function seedCatalog() {
  const fibraAta = await ensureAta({
    number: "094/2025",
    type: "FIBRA_OPTICA",
    vendorName: "SIDI SERVIÇOS DE COMUNICAÇÃO LTDA",
    managingAgency: "CMA",
    notes: "ATA demo de fibra óptica",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T23:59:59.000Z"),
  });

  const cftvAta = await ensureAta({
    number: "095/2025",
    type: "CFTV",
    vendorName: "FORNECEDOR DA ATA DE MANAUS",
    managingAgency: "CMA",
    notes: "ATA demo de CFTV",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T23:59:59.000Z"),
  });

  const fibraManaus = await ensureCoverageGroup({
    ataId: fibraAta.id,
    code: "MANAUS",
    name: "Manaus e Região Metropolitana",
    description: "Cobertura demo para capital",
    localities: [
      { cityName: "Manaus", stateUf: "AM" },
      { cityName: "Rio Preto da Eva", stateUf: "AM" },
    ],
  });

  const fibraInterior = await ensureCoverageGroup({
    ataId: fibraAta.id,
    code: "INTERIOR_NORTE",
    name: "Interior Norte",
    description: "Cobertura demo interior",
    localities: [
      { cityName: "Tabatinga", stateUf: "AM" },
      { cityName: "Tefé", stateUf: "AM" },
      { cityName: "Boa Vista", stateUf: "RR" },
      { cityName: "Porto Velho", stateUf: "RO" },
      { cityName: "Rio Branco", stateUf: "AC" },
    ],
  });

  const cftvManaus = await ensureCoverageGroup({
    ataId: cftvAta.id,
    code: "MANAUS",
    name: "Manaus",
    description: "Cobertura CFTV demo para Manaus",
    localities: [{ cityName: "Manaus", stateUf: "AM" }],
  });

  const fibraItemCabosManaus = await ensureAtaItem({
    ataId: fibraAta.id,
    coverageGroupId: fibraManaus.id,
    referenceCode: "1",
    description: "Lançamento de cabo óptico",
    unit: "M",
    unitPrice: 18.5,
    notes: "Serviço de fibra em Manaus",
  });

  const fibraItemCabosInterior = await ensureAtaItem({
    ataId: fibraAta.id,
    coverageGroupId: fibraInterior.id,
    referenceCode: "1",
    description: "Lançamento de cabo óptico",
    unit: "M",
    unitPrice: 23.75,
    notes: "Serviço de fibra no interior",
  });

  const cftvItemCamera = await ensureAtaItem({
    ataId: cftvAta.id,
    coverageGroupId: cftvManaus.id,
    referenceCode: "1",
    description: "Instalação de câmera IP",
    unit: "UN",
    unitPrice: 462.5,
    notes: "Instalação unitária demo",
  });

  return {
    fibraAta,
    cftvAta,
    fibraManaus,
    fibraInterior,
    cftvManaus,
    fibraItemCabosManaus,
    fibraItemCabosInterior,
    cftvItemCamera,
  };
}

async function clearDemoProjects() {
  const demoProjects = await prisma.project.findMany({
    where: {
      title: {
        startsWith: DEMO_TAG,
      },
    },
    select: { id: true },
  });

  if (demoProjects.length === 0) {
    return;
  }

  const projectIds = demoProjects.map((project) => project.id);

  const estimates = await prisma.estimate.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const estimateIds = estimates.map((item) => item.id);

  const diexRequests = await prisma.diexRequest.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const diexIds = diexRequests.map((item) => item.id);

  const serviceOrders = await prisma.serviceOrder.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const serviceOrderIds = serviceOrders.map((item) => item.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: "PROJECT", entityId: { in: projectIds } },
        { entityType: "ESTIMATE", entityId: { in: estimateIds } },
        { entityType: "DIEX_REQUEST", entityId: { in: diexIds } },
        { entityType: "SERVICE_ORDER", entityId: { in: serviceOrderIds } },
      ],
    },
  });

  await prisma.serviceOrderDeliveredDocument.deleteMany({
    where: { serviceOrderId: { in: serviceOrderIds } },
  });
  await prisma.serviceOrderScheduleItem.deleteMany({
    where: { serviceOrderId: { in: serviceOrderIds } },
  });
  await prisma.serviceOrderItem.deleteMany({
    where: { serviceOrderId: { in: serviceOrderIds } },
  });
  await prisma.serviceOrder.deleteMany({
    where: { id: { in: serviceOrderIds } },
  });

  await prisma.diexRequestItem.deleteMany({
    where: { diexRequestId: { in: diexIds } },
  });
  await prisma.diexRequest.deleteMany({
    where: { id: { in: diexIds } },
  });

  await prisma.estimateItem.deleteMany({
    where: { estimateId: { in: estimateIds } },
  });
  await prisma.estimate.deleteMany({
    where: { id: { in: estimateIds } },
  });

  await prisma.task.deleteMany({
    where: { projectId: { in: projectIds } },
  });

  await prisma.projectMember.deleteMany({
    where: { projectId: { in: projectIds } },
  });

  await prisma.project.deleteMany({
    where: { id: { in: projectIds } },
  });
}

async function createEstimate(params: {
  projectId: string;
  ataId: string;
  coverageGroupId: string;
  omId: string;
  omName: string;
  cityName: string;
  stateUf: "AM" | "RO" | "RR" | "AC";
  status: "RASCUNHO" | "FINALIZADA";
  items: Array<{
    ataItemId: string;
    referenceCode: string;
    description: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  notes?: string;
  createdAt?: Date;
}) {
  const total = params.items.reduce(
    (acc, item) => acc.plus(new Prisma.Decimal(item.quantity).mul(item.unitPrice)),
    new Prisma.Decimal(0),
  );

  return prisma.estimate.create({
    data: {
      projectId: params.projectId,
      ataId: params.ataId,
      coverageGroupId: params.coverageGroupId,
      omId: params.omId,
      status: params.status,
      omName: params.omName,
      destinationCityName: params.cityName,
      destinationStateUf: params.stateUf,
      notes: params.notes,
      totalAmount: total,
      createdAt: params.createdAt,
      updatedAt: params.createdAt,
      items: {
        create: params.items.map((item) => {
          const quantity = new Prisma.Decimal(item.quantity);
          const unitPrice = new Prisma.Decimal(item.unitPrice);
          return {
            ataItemId: item.ataItemId,
            referenceCode: item.referenceCode,
            description: item.description,
            unit: item.unit,
            quantity,
            unitPrice,
            subtotal: quantity.mul(unitPrice),
            notes: item.notes,
            createdAt: params.createdAt,
            updatedAt: params.createdAt,
          };
        }),
      },
    },
    include: {
      items: true,
    },
  });
}

async function createDiexFromEstimate(params: {
  projectId: string;
  estimate: Awaited<ReturnType<typeof createEstimate>>;
  diexNumber: string;
  issuedAt: Date;
  supplierName: string;
  supplierCnpj: string;
  requesterName: string;
  requesterRank: string;
  requesterCpf?: string | null;
  requesterRole?: string;
}) {
  return prisma.diexRequest.create({
    data: {
      projectId: params.projectId,
      estimateId: params.estimate.id,
      diexNumber: params.diexNumber,
      issuedAt: params.issuedAt,
      supplierName: params.supplierName,
      supplierCnpj: params.supplierCnpj,
      requesterName: params.requesterName,
      requesterRank: params.requesterRank,
      requesterCpf: params.requesterCpf ?? null,
      requesterRole: params.requesterRole ?? "Requisitante",
      totalAmount: params.estimate.totalAmount,
      documentStatus: "EMITIDO",
      createdAt: params.issuedAt,
      updatedAt: params.issuedAt,
      items: {
        create: params.estimate.items.map((item) => ({
          estimateItemId: item.id,
          itemCode: item.referenceCode,
          description: item.description,
          supplyUnit: item.unit,
          quantityRequested: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.subtotal,
          notes: item.notes,
          createdAt: params.issuedAt,
          updatedAt: params.issuedAt,
        })),
      },
    },
  });
}

async function createServiceOrderFromEstimate(params: {
  projectId: string;
  estimate: Awaited<ReturnType<typeof createEstimate>>;
  diexRequestId: string;
  serviceOrderNumber: string;
  issuedAt: Date;
  contractorName: string;
  contractorCnpj: string;
  commitmentNoteNumber: string;
  requesterName: string;
  requesterRank: string;
  requesterCpf?: string | null;
  plannedStartDate?: Date;
  plannedEndDate?: Date;
}) {
  return prisma.serviceOrder.create({
    data: {
      projectId: params.projectId,
      estimateId: params.estimate.id,
      diexRequestId: params.diexRequestId,
      serviceOrderNumber: params.serviceOrderNumber,
      issuedAt: params.issuedAt,
      contractorName: params.contractorName,
      contractorCnpj: params.contractorCnpj,
      commitmentNoteNumber: params.commitmentNoteNumber,
      requesterName: params.requesterName,
      requesterRank: params.requesterRank,
      requesterCpf: params.requesterCpf ?? null,
      totalAmount: params.estimate.totalAmount,
      documentStatus: "EMITIDO",
      createdAt: params.issuedAt,
      updatedAt: params.issuedAt,
      items: {
        create: params.estimate.items.map((item) => ({
          estimateItemId: item.id,
          itemCode: item.referenceCode,
          description: item.description,
          supplyUnit: item.unit,
          quantityOrdered: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.subtotal,
          notes: item.notes,
          createdAt: params.issuedAt,
          updatedAt: params.issuedAt,
        })),
      },
      scheduleItems: {
        create: [
          {
            orderIndex: 1,
            taskStep: "Mobilização",
            scheduleText: "Início em até 2 dias úteis",
            createdAt: params.issuedAt,
            updatedAt: params.issuedAt,
          },
        ],
      },
      deliveredDocuments: {
        create: [
          {
            description: "ART",
            isChecked: false,
            createdAt: params.issuedAt,
            updatedAt: params.issuedAt,
          },
          {
            description: "As-Built",
            isChecked: false,
            createdAt: params.issuedAt,
            updatedAt: params.issuedAt,
          },
        ],
      },
      plannedStartDate: params.plannedStartDate,
      plannedEndDate: params.plannedEndDate,
    },
  });
}

async function createProjectAuditLog(params: {
  projectId: string;
  actorUserId: string;
  actorName: string;
  summary: string;
  action?: "CREATE" | "STAGE_CHANGE" | "UPDATE" | "FINALIZE";
  metadata?: Prisma.InputJsonObject;
  createdAt?: Date;
}) {
  await prisma.auditLog.create({
    data: {
      entityType: "PROJECT",
      entityId: params.projectId,
      action: params.action ?? "UPDATE",
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      summary: params.summary,
      metadata: params.metadata,
      createdAt: params.createdAt,
    },
  });
}

async function seedDev(context: Awaited<ReturnType<typeof seedBase>>) {
  console.log("ℹ️ Seed dev: base administrativa e catálogo prontos.");
  console.log(`👤 Admin: ${context.users.admin.email} / 123456`);
  console.log(`👤 Gestor: ${context.users.gestor.email} / 123456`);
  console.log(`👤 Projetista: ${context.users.projetista.email} / 123456`);
  console.log(`👤 Consulta: ${context.users.consulta.email} / 123456`);
}

async function seedDemo(context: Awaited<ReturnType<typeof seedBase>>) {
  await clearDemoProjects();

  const omManaus = await prisma.militaryOrganization.findUniqueOrThrow({
    where: { sigla: "4º CTA" },
  });

  const omTabatinga = await prisma.militaryOrganization.findUniqueOrThrow({
    where: { sigla: "Cmdo Fron-Sol/8º BIS" },
  });

  const omPortoVelho = await prisma.militaryOrganization.findUniqueOrThrow({
    where: { sigla: "5º BEC" },
  });

  const ownerId = context.users.admin.id;
  const memberUserId = context.users.projetista.id;

  async function createProject(params: {
    title: string;
    description: string;
    status: "PLANEJAMENTO" | "EM_ANDAMENTO" | "PAUSADO" | "CONCLUIDO" | "CANCELADO";
    stage:
      | "ESTIMATIVA_PRECO"
      | "AGUARDANDO_NOTA_CREDITO"
      | "DIEX_REQUISITORIO"
      | "AGUARDANDO_NOTA_EMPENHO"
      | "OS_LIBERADA"
      | "SERVICO_EM_EXECUCAO"
      | "ANALISANDO_AS_BUILT"
      | "ATESTAR_NF"
      | "SERVICO_CONCLUIDO"
      | "CANCELADO";
    startDate?: Date;
    endDate?: Date;
    staleDays?: number;
    milestones?: Partial<{
      creditNoteNumber: string;
      creditNoteReceivedAt: Date;
      diexNumber: string;
      diexIssuedAt: Date;
      commitmentNoteNumber: string;
      commitmentNoteReceivedAt: Date;
      serviceOrderNumber: string;
      serviceOrderIssuedAt: Date;
      executionStartedAt: Date;
      asBuiltReceivedAt: Date;
      invoiceAttestedAt: Date;
      serviceCompletedAt: Date;
    }>;
    openTasks?: number;
  }) {
    const updatedAt = params.staleDays ? daysAgo(params.staleDays) : new Date();

    const project = await prisma.project.create({
      data: {
        title: `${DEMO_TAG} ${params.title}`,
        description: params.description,
        ownerId,
        status: params.status,
        stage: params.stage,
        startDate: params.startDate ?? daysAgo(30),
        endDate: params.endDate ?? daysAgo(-30),
        ...params.milestones,
        createdAt: daysAgo(45),
        updatedAt,
      },
    });

    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId: memberUserId,
        role: "Projetista responsável",
      },
    });

    const tasksToCreate = params.openTasks ?? 0;
    for (let index = 0; index < tasksToCreate; index += 1) {
      await prisma.task.create({
        data: {
          projectId: project.id,
          assigneeId: memberUserId,
          title: `${DEMO_TAG} Tarefa ${index + 1} - ${params.title}`,
          description: "Tarefa demo para alimentar summaries e alertas",
          status: "PENDENTE",
          priority: 3,
          createdAt: daysAgo(10),
          updatedAt: updatedAt,
        },
      });
    }

    await createProjectAuditLog({
      projectId: project.id,
      actorUserId: ownerId,
      actorName: context.users.admin.name,
      action: "CREATE",
      summary: `Projeto PRJ-${project.projectCode} criado`,
      createdAt: daysAgo(45),
    });

    return project;
  }

  // 1. Projeto em estimativa
  await createProject({
    title: "Fibra Manaus - Fase Inicial",
    description: "Projeto demo ainda em fase de estimativa",
    status: "PLANEJAMENTO",
    stage: "ESTIMATIVA_PRECO",
    staleDays: 2,
    openTasks: 1,
  });

  // 2. Aguardando NC sem NC
  const p2 = await createProject({
    title: "CFTV Manaus - Aguardando NC",
    description: "Projeto demo aguardando nota de crédito",
    status: "PLANEJAMENTO",
    stage: "AGUARDANDO_NOTA_CREDITO",
    staleDays: 20,
  });

  const est2 = await createEstimate({
    projectId: p2.id,
    ataId: context.catalog.cftvAta.id,
    coverageGroupId: context.catalog.cftvManaus.id,
    omId: omManaus.id,
    omName: omManaus.name,
    cityName: "Manaus",
    stateUf: "AM",
    status: "FINALIZADA",
    notes: "Estimativa finalizada aguardando NC",
    createdAt: daysAgo(25),
    items: [
      {
        ataItemId: context.catalog.cftvItemCamera.id,
        referenceCode: "1",
        description: "Instalação de câmera IP",
        unit: "UN",
        quantity: 10,
        unitPrice: 462.5,
      },
    ],
  });

  await createProjectAuditLog({
    projectId: p2.id,
    actorUserId: ownerId,
    actorName: context.users.admin.name,
    action: "STAGE_CHANGE",
    summary: `Projeto PRJ-${p2.projectCode} avançou para AGUARDANDO_NOTA_CREDITO`,
    createdAt: daysAgo(24),
    metadata: {
      previousStage: "ESTIMATIVA_PRECO",
      newStage: "AGUARDANDO_NOTA_CREDITO",
    },
  });

  // 3. Aguardando DIEx com NC
  const p3 = await createProject({
    title: "Fibra Rio Preto - NC recebida",
    description: "Projeto demo com NC e sem DIEx",
    status: "PLANEJAMENTO",
    stage: "AGUARDANDO_NOTA_CREDITO",
    staleDays: 12,
    milestones: {
      creditNoteNumber: "NC-2026-001",
      creditNoteReceivedAt: daysAgo(12),
    },
  });

  await createEstimate({
    projectId: p3.id,
    ataId: context.catalog.fibraAta.id,
    coverageGroupId: context.catalog.fibraManaus.id,
    omId: omManaus.id,
    omName: omManaus.name,
    cityName: "Rio Preto da Eva",
    stateUf: "AM",
    status: "FINALIZADA",
    notes: "Estimativa demo aguardando DIEx",
    createdAt: daysAgo(18),
    items: [
      {
        ataItemId: context.catalog.fibraItemCabosManaus.id,
        referenceCode: "1",
        description: "Lançamento de cabo óptico",
        unit: "M",
        quantity: 250,
        unitPrice: 18.5,
      },
    ],
  });

  // 4. Aguardando NE sem empenho
  const p4 = await createProject({
    title: "Fibra Tabatinga - DIEx emitido",
    description: "Projeto demo aguardando nota de empenho",
    status: "PLANEJAMENTO",
    stage: "AGUARDANDO_NOTA_EMPENHO",
    staleDays: 11,
    milestones: {
      creditNoteNumber: "NC-2026-002",
      creditNoteReceivedAt: daysAgo(18),
      diexNumber: "DIEX-2026-010",
      diexIssuedAt: daysAgo(15),
    },
  });

  const est4 = await createEstimate({
    projectId: p4.id,
    ataId: context.catalog.fibraAta.id,
    coverageGroupId: context.catalog.fibraInterior.id,
    omId: omTabatinga.id,
    omName: omTabatinga.name,
    cityName: "Tabatinga",
    stateUf: "AM",
    status: "FINALIZADA",
    notes: "Estimativa demo aguardando NE",
    createdAt: daysAgo(22),
    items: [
      {
        ataItemId: context.catalog.fibraItemCabosInterior.id,
        referenceCode: "1",
        description: "Lançamento de cabo óptico",
        unit: "M",
        quantity: 200,
        unitPrice: 23.75,
      },
    ],
  });

  await createDiexFromEstimate({
    projectId: p4.id,
    estimate: est4,
    diexNumber: "DIEX-2026-010",
    issuedAt: daysAgo(15),
    supplierName: context.catalog.fibraAta.vendorName,
    supplierCnpj: "12345678000199",
    requesterName: context.users.admin.name,
    requesterRank: context.users.admin.rank ?? "2º Ten",
    requesterCpf: context.users.admin.cpf,
  });

  // 5. Aguardando OS com NE
  const p5 = await createProject({
    title: "Fibra Porto Velho - NE recebida",
    description: "Projeto demo com NE, aguardando OS",
    status: "PLANEJAMENTO",
    stage: "AGUARDANDO_NOTA_EMPENHO",
    staleDays: 9,
    milestones: {
      creditNoteNumber: "NC-2026-003",
      creditNoteReceivedAt: daysAgo(16),
      diexNumber: "DIEX-2026-011",
      diexIssuedAt: daysAgo(13),
      commitmentNoteNumber: "NE-2026-020",
      commitmentNoteReceivedAt: daysAgo(9),
    },
  });

  const est5 = await createEstimate({
    projectId: p5.id,
    ataId: context.catalog.fibraAta.id,
    coverageGroupId: context.catalog.fibraInterior.id,
    omId: omPortoVelho.id,
    omName: omPortoVelho.name,
    cityName: "Porto Velho",
    stateUf: "RO",
    status: "FINALIZADA",
    notes: "Estimativa demo aguardando OS",
    createdAt: daysAgo(20),
    items: [
      {
        ataItemId: context.catalog.fibraItemCabosInterior.id,
        referenceCode: "1",
        description: "Lançamento de cabo óptico",
        unit: "M",
        quantity: 180,
        unitPrice: 23.75,
      },
    ],
  });

  await createDiexFromEstimate({
    projectId: p5.id,
    estimate: est5,
    diexNumber: "DIEX-2026-011",
    issuedAt: daysAgo(13),
    supplierName: context.catalog.fibraAta.vendorName,
    supplierCnpj: "12345678000199",
    requesterName: context.users.admin.name,
    requesterRank: context.users.admin.rank ?? "2º Ten",
    requesterCpf: context.users.admin.cpf,
  });

  // 6. OS liberada, sem execução
  const p6 = await createProject({
    title: "OS liberada - aguardando execução",
    description: "Projeto demo aguardando início de execução",
    status: "EM_ANDAMENTO",
    stage: "OS_LIBERADA",
    staleDays: 8,
    milestones: {
      creditNoteNumber: "NC-2026-004",
      creditNoteReceivedAt: daysAgo(18),
      diexNumber: "DIEX-2026-012",
      diexIssuedAt: daysAgo(16),
      commitmentNoteNumber: "NE-2026-021",
      commitmentNoteReceivedAt: daysAgo(12),
      serviceOrderNumber: "OS-2026-010",
      serviceOrderIssuedAt: daysAgo(8),
    },
  });

  const est6 = await createEstimate({
    projectId: p6.id,
    ataId: context.catalog.cftvAta.id,
    coverageGroupId: context.catalog.cftvManaus.id,
    omId: omManaus.id,
    omName: omManaus.name,
    cityName: "Manaus",
    stateUf: "AM",
    status: "FINALIZADA",
    notes: "Estimativa demo com OS liberada",
    createdAt: daysAgo(25),
    items: [
      {
        ataItemId: context.catalog.cftvItemCamera.id,
        referenceCode: "1",
        description: "Instalação de câmera IP",
        unit: "UN",
        quantity: 10,
        unitPrice: 462.5,
      },
    ],
  });

  const diex6 = await createDiexFromEstimate({
    projectId: p6.id,
    estimate: est6,
    diexNumber: "DIEX-2026-012",
    issuedAt: daysAgo(16),
    supplierName: context.catalog.cftvAta.vendorName,
    supplierCnpj: "99887766000155",
    requesterName: context.users.admin.name,
    requesterRank: context.users.admin.rank ?? "2º Ten",
    requesterCpf: context.users.admin.cpf,
  });

  await createServiceOrderFromEstimate({
    projectId: p6.id,
    estimate: est6,
    diexRequestId: diex6.id,
    serviceOrderNumber: "OS-2026-010",
    issuedAt: daysAgo(8),
    contractorName: context.catalog.cftvAta.vendorName,
    contractorCnpj: "99887766000155",
    commitmentNoteNumber: "NE-2026-021",
    requesterName: context.users.admin.name,
    requesterRank: context.users.admin.rank ?? "2º Ten",
    requesterCpf: context.users.admin.cpf,
    plannedStartDate: daysAgo(5),
    plannedEndDate: daysAgo(-20),
  });

  // 7. Em execução sem As-Built
  const p7 = await createProject({
    title: "Em execução sem As-Built",
    description: "Projeto demo em execução",
    status: "EM_ANDAMENTO",
    stage: "SERVICO_EM_EXECUCAO",
    staleDays: 7,
    milestones: {
      creditNoteNumber: "NC-2026-005",
      creditNoteReceivedAt: daysAgo(22),
      diexNumber: "DIEX-2026-013",
      diexIssuedAt: daysAgo(20),
      commitmentNoteNumber: "NE-2026-022",
      commitmentNoteReceivedAt: daysAgo(18),
      serviceOrderNumber: "OS-2026-011",
      serviceOrderIssuedAt: daysAgo(15),
      executionStartedAt: daysAgo(7),
    },
  });

  // 8. Aguardando atesto NF
  const p8 = await createProject({
    title: "Aguardando atesto de NF",
    description: "Projeto demo em fase de atesto",
    status: "EM_ANDAMENTO",
    stage: "ATESTAR_NF",
    staleDays: 4,
    milestones: {
      creditNoteNumber: "NC-2026-006",
      creditNoteReceivedAt: daysAgo(28),
      diexNumber: "DIEX-2026-014",
      diexIssuedAt: daysAgo(24),
      commitmentNoteNumber: "NE-2026-023",
      commitmentNoteReceivedAt: daysAgo(20),
      serviceOrderNumber: "OS-2026-012",
      serviceOrderIssuedAt: daysAgo(18),
      executionStartedAt: daysAgo(16),
      asBuiltReceivedAt: daysAgo(4),
    },
  });

  // 9. Projeto concluído completo
  const p9 = await createProject({
    title: "Projeto concluído",
    description: "Projeto demo concluído para dashboards e dossier",
    status: "CONCLUIDO",
    stage: "SERVICO_CONCLUIDO",
    staleDays: 1,
    openTasks: 2,
    milestones: {
      creditNoteNumber: "NC-2026-007",
      creditNoteReceivedAt: daysAgo(30),
      diexNumber: "DIEX-2026-015",
      diexIssuedAt: daysAgo(27),
      commitmentNoteNumber: "NE-2026-024",
      commitmentNoteReceivedAt: daysAgo(25),
      serviceOrderNumber: "OS-2026-013",
      serviceOrderIssuedAt: daysAgo(23),
      executionStartedAt: daysAgo(21),
      asBuiltReceivedAt: daysAgo(7),
      invoiceAttestedAt: daysAgo(2),
      serviceCompletedAt: daysAgo(2),
    },
  });

  const est9 = await createEstimate({
    projectId: p9.id,
    ataId: context.catalog.fibraAta.id,
    coverageGroupId: context.catalog.fibraManaus.id,
    omId: omManaus.id,
    omName: omManaus.name,
    cityName: "Manaus",
    stateUf: "AM",
    status: "FINALIZADA",
    notes: "Estimativa demo concluída",
    createdAt: daysAgo(34),
    items: [
      {
        ataItemId: context.catalog.fibraItemCabosManaus.id,
        referenceCode: "1",
        description: "Lançamento de cabo óptico",
        unit: "M",
        quantity: 250,
        unitPrice: 18.5,
      },
    ],
  });

  const diex9 = await createDiexFromEstimate({
    projectId: p9.id,
    estimate: est9,
    diexNumber: "DIEX-2026-015",
    issuedAt: daysAgo(27),
    supplierName: context.catalog.fibraAta.vendorName,
    supplierCnpj: "12345678000199",
    requesterName: context.users.admin.name,
    requesterRank: context.users.admin.rank ?? "2º Ten",
    requesterCpf: context.users.admin.cpf,
  });

  await createServiceOrderFromEstimate({
    projectId: p9.id,
    estimate: est9,
    diexRequestId: diex9.id,
    serviceOrderNumber: "OS-2026-013",
    issuedAt: daysAgo(23),
    contractorName: context.catalog.fibraAta.vendorName,
    contractorCnpj: "12345678000199",
    commitmentNoteNumber: "NE-2026-024",
    requesterName: context.users.admin.name,
    requesterRank: context.users.admin.rank ?? "2º Ten",
    requesterCpf: context.users.admin.cpf,
    plannedStartDate: daysAgo(22),
    plannedEndDate: daysAgo(3),
  });

  await createProjectAuditLog({
    projectId: p9.id,
    actorUserId: ownerId,
    actorName: context.users.admin.name,
    action: "STAGE_CHANGE",
    summary: `Projeto PRJ-${p9.projectCode} concluído`,
    createdAt: daysAgo(2),
    metadata: {
      previousStage: "ATESTAR_NF",
      newStage: "SERVICO_CONCLUIDO",
    },
  });

  console.log("🎯 Seed demo concluída: catálogo + 9 projetos de cenários operacionais.");
}

async function seedBase() {
  await ensurePermissionCatalog();
  await ensureRolePermissionMatrix();
  const seededUsers = await upsertUsers();
  await upsertOms();
  const catalog = await seedCatalog();

  return {
    users: seededUsers,
    catalog,
  };
}

async function main() {
  const mode = (process.env.SEED_MODE ?? "dev") as SeedMode;

  console.log(`🌱 Iniciando seed em modo: ${mode}`);

  const context = await seedBase();

  if (mode === "dev") {
    await seedDev(context);
  }

  if (mode === "demo") {
    await seedDemo(context);
  }

  console.log("✅ Seed concluída com sucesso.");
}

main()
  .catch((error) => {
    console.error("❌ Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
