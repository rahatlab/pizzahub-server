import { connectDb, disconnectDb } from "../src/config/db.js"
import { User } from "../src/models/User.js"
import { MenuItem } from "../src/models/MenuItem.js"
import { Order } from "../src/models/Order.js"
import { Transaction } from "../src/models/Transaction.js"

/**
 * One-off index sync (plan §6.2): models run with autoIndex:false, so run
 * `npm run db:indexes` after schema changes — never on cold start.
 */
async function run(): Promise<void> {
  await connectDb()

  for (const model of [User, MenuItem, Order, Transaction]) {
    const created = await model.syncIndexes()
    console.log(
      `${model.modelName}: ${created.length ? `created ${created.join(", ")}` : "in sync"}`
    )
  }

  await disconnectDb()
  console.log("Index sync complete.")
}

run().catch((error) => {
  console.error("Index sync failed:", error)
  process.exit(1)
})
