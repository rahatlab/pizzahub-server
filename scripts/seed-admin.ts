import { connectDb, disconnectDb } from "../src/config/db"
import { User } from "../src/models/User"

/**
 * Promotes an existing account to admin (plan §8.1): admins never self-
 * signup. Sign up on the client first, then run:
 *   npm run seed:admin -- you@example.com
 */
async function run(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase()

  if (!email) {
    console.error("Usage: npm run seed:admin -- you@example.com")
    console.error("Sign up with that email on the client first.")
    process.exit(1)
  }

  await connectDb()

  const user = await User.findOne({ email })
  if (!user) {
    console.error(`No user found with ${email}. Sign up on the client first.`)
    await disconnectDb()
    process.exit(1)
  }

  if (user.role === "admin") {
    console.log(`${email} is already an admin.`)
  } else {
    user.role = "admin"
    user.isBlocked = false
    await user.save()
    console.log(`${email} is now an admin.`)
  }

  await disconnectDb()
}

run().catch((error) => {
  console.error("Seed failed:", error)
  process.exit(1)
})
