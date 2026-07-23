import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { normalizeMojibakeText } from "../shared/text-normalization.js";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

function normalizeJsonStrings(value: JsonLike): JsonLike {
  if (typeof value === "string") return normalizeMojibakeText(value);
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeJsonStrings(item));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeJsonStrings(item)]),
  );
}

function textChanged(current: string | null | undefined, normalized: string | null | undefined) {
  return current !== normalized;
}

async function repairAtas() {
  const atas = await prisma.ata.findMany({
    select: {
      id: true,
      number: true,
      vendorName: true,
      managingAgency: true,
      notes: true,
    },
  });
  let corrected = 0;

  for (const ata of atas) {
    const data = {
      number: normalizeMojibakeText(ata.number),
      vendorName: normalizeMojibakeText(ata.vendorName),
      managingAgency: ata.managingAgency ? normalizeMojibakeText(ata.managingAgency) : ata.managingAgency,
      notes: ata.notes ? normalizeMojibakeText(ata.notes) : ata.notes,
    };

    if (
      textChanged(ata.number, data.number) ||
      textChanged(ata.vendorName, data.vendorName) ||
      textChanged(ata.managingAgency, data.managingAgency) ||
      textChanged(ata.notes, data.notes)
    ) {
      await prisma.ata.update({ where: { id: ata.id }, data });
      corrected += 1;
    }
  }

  return corrected;
}

async function repairAtaItems() {
  const items = await prisma.ataItem.findMany({
    select: {
      id: true,
      description: true,
      unit: true,
      notes: true,
    },
  });
  let corrected = 0;

  for (const item of items) {
    const data = {
      description: normalizeMojibakeText(item.description),
      unit: normalizeMojibakeText(item.unit),
      notes: item.notes ? normalizeMojibakeText(item.notes) : item.notes,
    };

    if (
      textChanged(item.description, data.description) ||
      textChanged(item.unit, data.unit) ||
      textChanged(item.notes, data.notes)
    ) {
      await prisma.ataItem.update({ where: { id: item.id }, data });
      corrected += 1;
    }
  }

  return corrected;
}

async function repairCopiedItemDescriptions() {
  const [estimateItems, diexItems, serviceOrderItems] = await Promise.all([
    prisma.estimateItem.findMany({ select: { id: true, description: true } }),
    prisma.diexRequestItem.findMany({ select: { id: true, description: true } }),
    prisma.serviceOrderItem.findMany({ select: { id: true, description: true } }),
  ]);
  let corrected = 0;

  for (const item of estimateItems) {
    const description = normalizeMojibakeText(item.description);
    if (textChanged(item.description, description)) {
      await prisma.estimateItem.update({ where: { id: item.id }, data: { description } });
      corrected += 1;
    }
  }

  for (const item of diexItems) {
    const description = normalizeMojibakeText(item.description);
    if (textChanged(item.description, description)) {
      await prisma.diexRequestItem.update({ where: { id: item.id }, data: { description } });
      corrected += 1;
    }
  }

  for (const item of serviceOrderItems) {
    const description = normalizeMojibakeText(item.description);
    if (textChanged(item.description, description)) {
      await prisma.serviceOrderItem.update({ where: { id: item.id }, data: { description } });
      corrected += 1;
    }
  }

  return corrected;
}

async function repairCoverageGroups() {
  const groups = await prisma.ataCoverageGroup.findMany({
    select: {
      id: true,
      name: true,
      description: true,
    },
  });
  let corrected = 0;

  for (const group of groups) {
    const data = {
      name: normalizeMojibakeText(group.name),
      description: group.description ? normalizeMojibakeText(group.description) : group.description,
    };

    if (
      textChanged(group.name, data.name) ||
      textChanged(group.description, data.description)
    ) {
      await prisma.ataCoverageGroup.update({ where: { id: group.id }, data });
      corrected += 1;
    }
  }

  return corrected;
}

async function repairSnapshots() {
  const snapshots = await prisma.ataItemExternalBalanceSnapshot.findMany({
    select: {
      id: true,
      externalBalance: true,
      warnings: true,
    },
  });
  let corrected = 0;

  for (const snapshot of snapshots) {
    const externalBalance = snapshot.externalBalance
      ? normalizeJsonStrings(snapshot.externalBalance as JsonLike)
      : snapshot.externalBalance;
    const warnings = snapshot.warnings
      ? normalizeJsonStrings(snapshot.warnings as JsonLike)
      : snapshot.warnings;

    if (
      JSON.stringify(snapshot.externalBalance) !== JSON.stringify(externalBalance) ||
      JSON.stringify(snapshot.warnings) !== JSON.stringify(warnings)
    ) {
      await prisma.ataItemExternalBalanceSnapshot.update({
        where: { id: snapshot.id },
        data: {
          externalBalance:
            externalBalance === null
              ? Prisma.JsonNull
              : (externalBalance as Prisma.InputJsonValue),
          warnings:
            warnings === null
              ? Prisma.JsonNull
              : (warnings as Prisma.InputJsonValue),
        },
      });
      corrected += 1;
    }
  }

  return corrected;
}

async function main() {
  const [atas, ataItems, copiedItems, coverageGroups, snapshots] = await Promise.all([
    repairAtas(),
    repairAtaItems(),
    repairCopiedItemDescriptions(),
    repairCoverageGroups(),
    repairSnapshots(),
  ]);

  console.info("repair:mojibake completed", {
    atas,
    ataItems,
    copiedItems,
    coverageGroups,
    snapshots,
    total: atas + ataItems + copiedItems + coverageGroups + snapshots,
  });
}

main()
  .catch((error) => {
    console.error("repair:mojibake failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
