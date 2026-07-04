import { PrismaClient, UserRole, PrinterMachineModel, InkColor } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Machine ink configurations
const machineInkConfigs = {
  TS100_1600_SUBLIMATION: [
    { color: 'BLACK' as InkColor, capacity: 1000 },
    { color: 'CYAN' as InkColor, capacity: 1000 },
    { color: 'MAGENTA' as InkColor, capacity: 1000 },
    { color: 'YELLOW' as InkColor, capacity: 1000 },
  ],
  JV100_160: [
    { color: 'BLACK' as InkColor, capacity: 2000 },
    { color: 'CYAN' as InkColor, capacity: 2000 },
    { color: 'MAGENTA' as InkColor, capacity: 2000 },
    { color: 'YELLOW' as InkColor, capacity: 2000 },
  ],
  UCJV300_160: [
    { color: 'BLACK' as InkColor, capacity: 1000 },
    { color: 'CYAN' as InkColor, capacity: 1000 },
    { color: 'MAGENTA' as InkColor, capacity: 1000 },
    { color: 'YELLOW' as InkColor, capacity: 1000 },
    { color: 'CLEAR' as InkColor, capacity: 2000 },
    { color: 'WHITE' as InkColor, capacity: 2000 },
  ],
};

async function seedSuperAdmin() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@sdlmp.local';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
    },
  });

  console.log(`Created super admin ${email} — sign in and change the password immediately.`);
}

async function seedMachines() {
  const machines = [
    { model: PrinterMachineModel.TS100_1600_SUBLIMATION, label: 'TS100-1600 #1' },
    { model: PrinterMachineModel.JV100_160, label: 'JV100-160 #1' },
    { model: PrinterMachineModel.UCJV300_160, label: 'UCJV300-160 #1' },
  ];

  for (const machineData of machines) {
    const existing = await prisma.printerMachine.findFirst({
      where: { label: machineData.label },
    });

    if (existing) {
      console.log(`Machine already exists: ${machineData.label}`);
      continue;
    }

    const machine = await prisma.printerMachine.create({
      data: machineData,
    });

    // Initialize inks
    const inkConfig = machineInkConfigs[machineData.model];
    if (inkConfig) {
      await prisma.machineInk.createMany({
        data: inkConfig.map((ink) => ({
          machineId: machine.id,
          inkColor: ink.color,
          maxCapacity: ink.capacity,
          currentUsage: 0,
        })),
      });
    }

    console.log(`Created machine: ${machineData.label}`);
  }
}

async function main() {
  await seedSuperAdmin();
  await seedMachines();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
