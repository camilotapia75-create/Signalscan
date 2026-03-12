import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@adlottery.com" },
    update: {},
    create: {
      email: "admin@adlottery.com",
      name: "Admin",
      password: hashedPassword,
      isAdmin: true,
    },
  });

  console.log("Seeded admin user:", admin.email);

  // Create test user
  const userPassword = await bcrypt.hash("user123", 10);
  const testUser = await prisma.user.upsert({
    where: { email: "user@adlottery.com" },
    update: {},
    create: {
      email: "user@adlottery.com",
      name: "Test User",
      password: userPassword,
      isAdmin: false,
    },
  });

  console.log("Seeded test user:", testUser.email);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
