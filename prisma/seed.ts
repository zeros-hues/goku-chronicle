import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  // Admin user
  const hashedPassword = await bcrypt.hash('goku2026', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      hoursTarget: 8,
      overtimeThreshold: 8,
    },
  })

  // Clients
  const appasamy = await prisma.client.upsert({
    where: { name: 'Appasamy' },
    update: {},
    create: { name: 'Appasamy', hasRetainership: true },
  })

  const gokuStudio = await prisma.client.upsert({
    where: { name: 'Goku Studio' },
    update: {},
    create: { name: 'Goku Studio', hasRetainership: false },
  })

  // Appasamy projects
  const appasamyProjects: { name: string; billingType: 'RETAINERSHIP' | 'OUT_OF_RETAINERSHIP' | 'INTERNAL' }[] = [
    { name: 'Autoref',       billingType: 'RETAINERSHIP' },
    { name: 'Perimeter',     billingType: 'RETAINERSHIP' },
    { name: 'Phaco',         billingType: 'RETAINERSHIP' },
    { name: 'Dynalase',      billingType: 'RETAINERSHIP' },
    { name: '3D Microscope', billingType: 'RETAINERSHIP' },
    { name: 'Oculume',       billingType: 'OUT_OF_RETAINERSHIP' },
    { name: 'Digimap',       billingType: 'OUT_OF_RETAINERSHIP' },
  ]
  for (const p of appasamyProjects) {
    await prisma.project.upsert({
      where: { name_clientId: { name: p.name, clientId: appasamy.id } },
      update: {},
      create: { name: p.name, clientId: appasamy.id, billingType: p.billingType },
    })
  }

  // Goku Studio projects
  await prisma.project.upsert({
    where: { name_clientId: { name: 'Website', clientId: gokuStudio.id } },
    update: {},
    create: { name: 'Website', clientId: gokuStudio.id, billingType: 'INTERNAL' },
  })

  // Team members
  const members: { name: string; initials: string }[] = [
    { name: 'Gokulakannan', initials: 'G'   },
    { name: 'Pradeep',      initials: 'Pd'  },
    { name: 'Dinesh Kumar', initials: 'DK'  },
    { name: 'Mustaq Ahmed', initials: 'MA'  },
    { name: 'Siddharth',    initials: 'Sid' },
    { name: 'Prakash',      initials: 'PR'  },
  ]
  for (const m of members) {
    const existing = await prisma.teamMember.findFirst({ where: { name: m.name } })
    if (!existing) {
      await prisma.teamMember.create({ data: m })
    }
  }

  console.log('Seed complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
