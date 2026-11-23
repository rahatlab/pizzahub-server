import mongoose from "mongoose"
import { env } from "./env.js"

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

const globalForMongoose = globalThis as unknown as {
  __pizzahubMongoose?: MongooseCache
}

const cache: MongooseCache =
  globalForMongoose.__pizzahubMongoose ?? {
    conn: null,
    promise: null,
  }

if (!globalForMongoose.__pizzahubMongoose) {
  globalForMongoose.__pizzahubMongoose = cache
}

mongoose.set("strictQuery", true)
// sanitizeFilter stays OFF: it wraps every $in/$regex/$gt operator in $eq and
// silently breaks legitimate filters (plan-limit counts, menu search, expiry).
// Injection defense per PROJECT_PLAN §12: every input is Zod-validated to a
// scalar and regex input is escaped — user objects never reach a filter.
mongoose.set("sanitizeFilter", false)

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB,
        maxPoolSize: 5,
        bufferCommands: false,
        serverSelectionTimeoutMS: 5000,
      })
      .catch((error) => {
        cache.promise = null
        throw error
      })
  }

  cache.conn = await cache.promise
  return cache.conn
}

export function dbState(): number {
  return mongoose.connection.readyState
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
  cache.conn = null
  cache.promise = null
}
