import { prisma } from "../config/prisma.js";
import { normalizeMojibakeText } from "../shared/text-normalization.js";

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

async function main() {
  const [atas, ataItems, copiedItems, coverageGroups] = await Promise.all([
    repairAtas(),
    repairAtaItems(),
    repairCopiedItemDescriptions(),
    repairCoverageGroups(),
  ]);

  console.info("repair:mojibake completed", {
    atas,
    ataItems,
    copiedItems,
    coverageGroups,
    total: atas + ataItems + copiedItems + coverageGroups,
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
