import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 10,
})

const db = drizzle(client, { schema })

export function getDb() {
  return db
}

export type AppDatabase = ReturnType<typeof getDb>
