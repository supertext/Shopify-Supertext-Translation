import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

// On SIGTERM (Railway replacing the container on a redeploy), react-router-serve closes the HTTP
// server; close the database pool too and end with exit code 0, at the latest after 2 seconds
// (a running translation is marked "interrupted" on the next start), so Railway doesn't report a crash.
process.once("SIGTERM", () => {
  setTimeout(() => process.exit(0), 2000).unref();
  void prisma.$disconnect().catch(() => undefined);
});

export default prisma;
