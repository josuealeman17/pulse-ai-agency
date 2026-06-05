// Vercel serverless entry. Vercel serves files in this `api/` directory as
// functions; the vercel.json rewrite routes every path here, and the Hono app
// (with its own router) handles them. Local dev uses src/index.ts instead.
import { handle } from "hono/vercel";
import { app } from "../src/app.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default handle(app);
