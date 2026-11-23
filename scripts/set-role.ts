import { connectDb, disconnectDb } from "../src/config/db"
import { User } from "../src/models/User"

/**
 * Dev helper: flips a known test account's role (role can't be chosen at
 * signup — admins are seeded, vendors get the role for testing here).
 * Usage: tsx scripts/set-role.ts email@x.com vendor
 */
async function run(): Promise<void> {
  const [email, role] = process.argv.slice(2)
  if (!email || !["customer", "vendor", "admin"].includes(role ?? "")) {
    console.error("Usage: tsx scripts/set-role.ts <email> <customer|vendor|admin>")
    process.exit(1)
  }

  await connectDb()
  const user = await User.findOne({ email })
  if (!user) {
    console.error(`No user with ${email}`)
    await disconnectDb()
    process.exit(1)
  }

  user.role = role as "customer" | "vendor" | "admin"
  await user.save()
  console.log(`${email} → ${role}`)
  await disconnectDb()
}

run().catch((error) => {
  console.error("Failed:", error)
  process.exit(1)
})
