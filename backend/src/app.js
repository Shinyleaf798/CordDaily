import express from "express";
import cors from "cors";
import env from "./config/env.js";
import routes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ success: true, data: { status: "ok" }, error: null }));

app.use("/", routes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`CordDaily backend listening on port ${env.port}`);
});
