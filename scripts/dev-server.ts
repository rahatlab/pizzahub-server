import app from "../src/app.js"
import { env } from "../src/config/env.js"

// Local-only entry (plan §6.1): Vercel never sees an app.listen.
const port = env.PORT

app.listen(port, () => {
  console.log(`PizzaHub API listening on http://localhost:${port}/api`)
})
