import { PrismaClient } from "@prisma/client";
import { InMemoryPrisma } from "./in-memory-db";

const realPrisma = new PrismaClient({
  log: [],
});

const inMemoryDb = new InMemoryPrisma();

let isPostgresAvailable: boolean | null = null;

// Initial check for PostgreSQL availability
async function checkPostgres() {
  if (isPostgresAvailable !== null) return isPostgresAvailable;
  try {
    // Attempt a lightweight query with 1.5s timeout
    await Promise.race([
      realPrisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500)),
    ]);
    isPostgresAvailable = true;
    console.log("[Database] Connected to PostgreSQL on localhost:5432");
  } catch {
    isPostgresAvailable = false;
    await realPrisma.$disconnect().catch(() => {});
    console.log("[Database] PostgreSQL not reachable on localhost:5432. Activating resilient in-memory tenant store.");
  }
  return isPostgresAvailable;
}

// Trigger check immediately in background
checkPostgres().catch(() => {});

const defaultTransactionWrapper = async (arg: any) => {
  const available = await checkPostgres();
  if (available) {
    try {
      return await realPrisma.$transaction(arg);
    } catch (err: any) {
      if (err?.message?.includes("Can't reach database server") || err?.code === "P1001") {
        isPostgresAvailable = false;
        return inMemoryDb.$transaction(arg);
      }
      throw err;
    }
  }
  return inMemoryDb.$transaction(arg);
};

// Create transparent proxy delegating to real Prisma or in-memory fallback
export const prisma: PrismaClient = new Proxy(realPrisma, {
  get(target: any, prop: string | symbol) {
    if (prop === "$transaction") {
      return target._customTransaction || defaultTransactionWrapper;
    }

    if (prop in inMemoryDb) {
      const realModel = target[prop];
      const memModel = (inMemoryDb as any)[prop];

      if (typeof memModel === "object" && memModel !== null) {
        return new Proxy(memModel, {
          get(mTarget: any, mProp: string) {
            if (typeof mTarget[mProp] !== "function") {
              return mTarget[mProp];
            }
            return (...args: any[]) => {
              if (isPostgresAvailable === false) {
                return mTarget[mProp](...args);
              }
              return (async () => {
                const available = await checkPostgres();
                if (available && realModel && typeof realModel[mProp] === "function") {
                  try {
                    return await realModel[mProp](...args);
                  } catch (err: any) {
                    if (err?.message?.includes("Can't reach database server") || err?.code === "P1001") {
                      isPostgresAvailable = false;
                      return mTarget[mProp](...args);
                    }
                    throw err;
                  }
                }
                return mTarget[mProp](...args);
              })();
            };
          },
        });
      }
    }

    return target[prop];
  },
  set(target: any, prop: string | symbol, value: any) {
    if (prop === "$transaction") {
      if (value === defaultTransactionWrapper || !value) {
        delete target._customTransaction;
      } else {
        target._customTransaction = value;
      }
      return true;
    }
    target[prop] = value;
    return true;
  },
});

export default prisma;
