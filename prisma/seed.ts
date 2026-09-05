import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Populando o banco de dados com os Planos do SaaS...');

  await prisma.plan.upsert({
    where: { slug: 'basic' },
    update: {},
    create: {
      name: 'Plano Inicial',
      slug: 'basic',
      priceUSD: 12.00,
      priceAOA: 11000.00,
      priceBRL: 60.00,
      maxSocialNetworks: 1,
      maxProposalsPerMonth: 5,
      customDomainAllowed: false,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: {
      name: 'Plano Profissional',
      slug: 'pro',
      priceUSD: 30.00,
      priceAOA: 28000.00,
      priceBRL: 150.00,
      maxSocialNetworks: -1, // Ilimitado
      maxProposalsPerMonth: -1, // Ilimitado
      customDomainAllowed: true,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'agency' },
    update: {},
    create: {
      name: 'Plano Agência',
      slug: 'agency',
      priceUSD: 80.00,
      priceAOA: 75000.00,
      priceBRL: 400.00,
      maxSocialNetworks: -1,
      maxProposalsPerMonth: -1,
      customDomainAllowed: true,
    },
  });

  console.log('✅ Seeding concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });