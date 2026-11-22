import { connectDb, disconnectDb } from "../src/config/db"
import { User } from "../src/models/User"
import { MenuItem } from "../src/models/MenuItem"

type DemoItem = {
  itemName: string
  category: string
  description: string
  price: number
  location: string
  images: string[]
}

const DEMO_VENDOR_EMAIL = "demo-vendor@pizzahub.test"
const LOCATIONS = ["Gulshan", "Dhanmondi", "Banani", "Mirpur", "Uttara", "Mohammadpur"]

const IMG = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=60`

const DEMO_ITEMS: DemoItem[] = [
  {
    itemName: "Margherita Classic",
    category: "Classic Pizzas",
    description: "San Marzano tomato, fresh mozzarella, basil, olive oil on a hand-tossed crust.",
    price: 8.99,
    location: LOCATIONS[0],
    images: [IMG("photo-1513104890138-7c749659a591")],
  },
  {
    itemName: "Pepperoni Supreme",
    category: "Classic Pizzas",
    description: "Double pepperoni, melted mozzarella, and oregano over rich tomato sauce.",
    price: 11.99,
    location: LOCATIONS[1],
    images: [IMG("photo-1565299624946-b28f40a0ae38")],
  },
  {
    itemName: "Garden Veggie",
    category: "Vegetarian Pizzas",
    description: "Bell peppers, onion, olives, mushroom, and tomato on a thin crispy base.",
    price: 10.49,
    location: LOCATIONS[2],
    images: [IMG("photo-1574071318508-1cdbab80d002")],
  },
  {
    itemName: "Paneer Tikka Pizza",
    category: "Vegetarian Pizzas",
    description: "Spiced paneer chunks, onion, capsicum, and mint drizzle with mozzarella.",
    price: 12.49,
    location: LOCATIONS[3],
    images: [IMG("photo-1593560708920-61dd98c46a4e")],
  },
  {
    itemName: "Meat Feast",
    category: "Meat Lovers",
    description: "Pepperoni, sausage, beef bacon, and grilled chicken piled high.",
    price: 13.99,
    location: LOCATIONS[4],
    images: [IMG("photo-1571407970349-bc81e7e96d47")],
  },
  {
    itemName: "BBQ Chicken Blaze",
    category: "Meat Lovers",
    description: "Smoky BBQ sauce, roasted chicken, red onion, and cilantro with mozzarella.",
    price: 12.99,
    location: LOCATIONS[5],
    images: [IMG("photo-1604382354936-07c5d9983bd3")],
  },
  {
    itemName: "Truffle Mushroom Gourmet",
    category: "Specialty / Gourmet Pizzas",
    description: "Wild mushrooms, truffle oil, thyme, caramelized onion, and fontina cheese.",
    price: 15.99,
    location: LOCATIONS[0],
    images: [IMG("photo-1513104890138-7c749659a591")],
  },
  {
    itemName: "Four Cheese Deluxe",
    category: "Specialty / Gourmet Pizzas",
    description: "Mozzarella, cheddar, parmesan, and blue cheese with a honey finish.",
    price: 13.49,
    location: LOCATIONS[2],
    images: [IMG("photo-1565299624946-b28f40a0ae38")],
  },
  {
    itemName: "Garlic Bread Bites",
    category: "Sides & Appetizers",
    description: "Golden garlic butter bread bites served with marinara dip.",
    price: 4.99,
    location: LOCATIONS[1],
    images: [IMG("photo-1574071318508-1cdbab80d002")],
  },
  {
    itemName: "Crispy Chicken Wings",
    category: "Sides & Appetizers",
    description: "Eight pieces of crispy fried wings tossed in spicy glaze.",
    price: 6.99,
    location: LOCATIONS[3],
    images: [IMG("photo-1571407970349-bc81e7e96d47")],
  },
  {
    itemName: "Chocolate Lava Cake",
    category: "Beverages & Desserts",
    description: "Warm chocolate cake with a molten center and vanilla scoop.",
    price: 5.49,
    location: LOCATIONS[4],
    images: [IMG("photo-1593560708920-61dd98c46a4e")],
  },
  {
    itemName: "Fresh Lime Soda",
    category: "Beverages & Desserts",
    description: "Chilled lime, mint, and sparkling soda over crushed ice.",
    price: 2.99,
    location: LOCATIONS[5],
    images: [IMG("photo-1604382354936-07c5d9983bd3")],
  },
]

/**
 * Seeds 12 approved menu items across all six categories for a demo vendor
 * (plan §14 Phase 2). Usage:
 *   npm run seed:demo                 → creates/uses demo vendor
 *   npm run seed:demo -- you@ex.com   → uses your existing vendor account
 *
 * The auto-created demo vendor has no password (Better Auth hashes live in
 * its account collection) — sign up normally to get a login, then pass that
 * email instead.
 */
async function run(): Promise<void> {
  const vendorArg = process.argv[2]?.trim().toLowerCase()

  await connectDb()

  let vendor
  if (vendorArg) {
    vendor = await User.findOne({ email: vendorArg })
    if (!vendor) {
      console.error(`No user found with ${vendorArg}.`)
      await disconnectDb()
      process.exit(1)
    }
    if (vendor.role !== "vendor") {
      console.error(`${vendorArg} is not a vendor account.`)
      await disconnectDb()
      process.exit(1)
    }
  } else {
    vendor = await User.findOne({ email: DEMO_VENDOR_EMAIL })
    if (!vendor) {
      vendor = await User.create({
        name: "Demo Vendor",
        email: DEMO_VENDOR_EMAIL,
        emailVerified: true,
        role: "vendor",
        businessName: "PizzaHub Demo Kitchen",
      })
      console.log(`Created demo vendor ${DEMO_VENDOR_EMAIL} (no password).`)
    }
  }

  let upserted = 0
  for (const item of DEMO_ITEMS) {
    await MenuItem.updateOne(
      { vendorId: vendor._id, itemName: item.itemName },
      { $set: { ...item, vendorId: vendor._id, status: "approved" } },
      { upsert: true }
    )
    upserted += 1
  }

  console.log(
    `Seeded ${upserted} approved menu items for ${vendor.email} (${vendor.businessName}).`
  )
  await disconnectDb()
}

run().catch((error) => {
  console.error("Seed failed:", error)
  process.exit(1)
})
