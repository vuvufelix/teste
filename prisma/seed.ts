import { PrismaClient, Role, PlanAudience } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 A popular o banco de dados com os 6 planos comerciais do Influkit...');

  const plans = [
    // --- INFLUENCIADORES ---
    {
      name: 'Influenciador Gratuito',
      slug: 'influencer-free',
      audience: PlanAudience.INFLUENCER,
      priceUSD: 0,
      priceAOA: 0,
      priceEUR: 0,
      durationInDays: 30,
      maxSocialNetworks: 1,
      maxProposalsPerMonth: 2,
      maxCreators: 1,
      hasAIAssistant: false,
      customDomainAllowed: false,
      customizationLevel: 'BASIC',
      isActive: true,
    },
    {
      name: 'Influenciador Inicial',
      slug: 'influencer-basic',
      audience: PlanAudience.INFLUENCER,
      priceUSD: 5.00,
      priceAOA: 3500.00,
      priceEUR: 5.00,
      durationInDays: 30,
      maxSocialNetworks: 2,
      maxProposalsPerMonth: 10,
      maxCreators: 1,
      hasAIAssistant: false,
      customDomainAllowed: false,
      customizationLevel: 'INTERMEDIATE',
      isActive: true,
    },
    {
      name: 'Influenciador Profissional',
      slug: 'influencer-pro',
      audience: PlanAudience.INFLUENCER,
      priceUSD: 12.00,
      priceAOA: 9000.00,
      priceEUR: 11.00,
      durationInDays: 30,
      maxSocialNetworks: 5,
      maxProposalsPerMonth: -1, // Ilimitado
      maxCreators: 1,
      hasAIAssistant: true,
      customDomainAllowed: true,
      customizationLevel: 'ADVANCED',
      isActive: true,
    },

    // --- AGÊNCIAS ---
    {
      name: 'Agência Gratuita',
      slug: 'agency-free',
      audience: PlanAudience.AGENCY,
      priceUSD: 0,
      priceAOA: 0,
      priceEUR: 0,
      durationInDays: 30,
      maxSocialNetworks: 5,
      maxProposalsPerMonth: 3,
      maxCreators: 1,
      hasAIAssistant: false,
      customDomainAllowed: false,
      customizationLevel: 'BASIC',
      isActive: true,
    },
    {
      name: 'Agência Inicial',
      slug: 'agency-basic',
      audience: PlanAudience.AGENCY,
      priceUSD: 15.00,
      priceAOA: 10000.00,
      priceEUR: 14.00,
      durationInDays: 30,
      maxSocialNetworks: 10,
      maxProposalsPerMonth: 20,
      maxCreators: 3,
      hasAIAssistant: false,
      customDomainAllowed: false,
      customizationLevel: 'INTERMEDIATE',
      isActive: true,
    },
    {
      name: 'Agência Profissional',
      slug: 'agency-pro',
      audience: PlanAudience.AGENCY,
      priceUSD: 35.00,
      priceAOA: 25000.00,
      priceEUR: 32.00,
      durationInDays: 30,
      maxSocialNetworks: 20,
      maxProposalsPerMonth: -1, // Ilimitado
      maxCreators: 10,
      hasAIAssistant: true,
      customDomainAllowed: true,
      customizationLevel: 'ADVANCED',
      isActive: true,
    },
  ];

  for (const planData of plans) {
    await prisma.plan.upsert({
      where: { slug: planData.slug },
      update: planData,
      create: planData,
    });
  }

  console.log('✅ 6 planos comerciais inseridos/atualizados com sucesso!');

  // Criação / Atualização do Super Admin
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