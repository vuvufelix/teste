import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Populando o banco de dados com os Planos do SaaS...');

  // 1. Plano Inicial (Basic)
  await prisma.plan.upsert({
    where: { slug: 'basic' },
    update: {
      name: 'Plano Inicial',
      priceUSD: 12.00,
      priceAOA: 11000.00,
      priceBRL: 60.00,
      maxSocialNetworks: 1, // Limite de 1 rede social
      maxProposalsPerMonth: 5,
      customDomainAllowed: false,
    },
    create: {
      name: 'Plano Inicial',
      slug: 'basic',
      priceUSD: 12.00,
      priceAOA: 11000.00,
      priceBRL: 60.00,
      maxSocialNetworks: 1, // Permite apenas 1 rede social
      maxProposalsPerMonth: 5,
      customDomainAllowed: false,
    },
  });

  // 2. Plano Profissional (Pro)
  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {
      name: 'Plano Profissional',
      priceUSD: 30.00,
      priceAOA: 28000.00,
      priceBRL: 150.00,
      maxSocialNetworks: 5, // Limite de até 5 redes sociais
      maxProposalsPerMonth: -1, // Ilimitado
      customDomainAllowed: true,
    },
    create: {
      name: 'Plano Profissional',
      slug: 'pro',
      priceUSD: 30.00,
      priceAOA: 28000.00,
      priceBRL: 150.00,
      maxSocialNetworks: 5, // Até 5 redes sociais
      maxProposalsPerMonth: -1, // Ilimitado
      customDomainAllowed: true,
    },
  });

  // 3. Plano Agência (Agency)
  await prisma.plan.upsert({
    where: { slug: 'agency' },
    update: {
      name: 'Plano Agência',
      priceUSD: 80.00,
      priceAOA: 75000.00,
      priceBRL: 400.00,
      maxSocialNetworks: -1, // Ilimitado (-1)
      maxProposalsPerMonth: -1, // Ilimitado (-1)
      customDomainAllowed: true,
    },
    create: {
      name: 'Plano Agência',
      slug: 'agency',
      priceUSD: 80.00,
      priceAOA: 75000.00,
      priceBRL: 400.00,
      maxSocialNetworks: -1, // Redes sociais ilimitadas
      maxProposalsPerMonth: -1, // Propostas ilimitadas
      customDomainAllowed: true,
    },
  });

  console.log('✅ Planos inseridos/atualizados com sucesso!');

  // 4. Criação / Atualização do Super Admin
  const adminEmail = 'vuvufelix2018@gmail.com';
  const defaultPassword = await bcrypt.hash('magrelo123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.SUPER_ADMIN,
    },
    create: {
      name: 'Admin Vuvu Félix',
      email: adminEmail,
      role: Role.SUPER_ADMIN,
      passwordHash: defaultPassword,
    },
  });

  console.log('✅ Seeding concluído com sucesso!');
  console.log('----------------------------------------------------');
  console.log(`🔑 Super Admin registrado: ${adminUser.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });