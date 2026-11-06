import { Hono } from "hono";
import type { AppEnv } from "./types/bindings";
import { customCors } from "./middlewares/cors";
import { requestLogger } from "./middlewares/logger";
import { errorHandler, notFoundHandler } from "./middlewares/error";

// Import Route Handlers
import { wellKnownRoutes } from "./routes/well-known.route";
import { oauthRoutes } from "./routes/oauth.route";
import { clientsRoutes } from "./routes/clients.route";

const app = new Hono<AppEnv>();

// 1. Middlewares toàn cục
app.use("*", requestLogger());
app.use("*", customCors());

// 2. Trang chủ - API Discovery (Pure JSON, No HTML)
app.get("/", (c) => {
  const issuer = c.env.NEXT_PUBLIC_SITE_URL || "https://iam.hnamhocit.workers.dev";
  const webUrl = c.env.NEXT_PUBLIC_WEB_URL || "https://vntez-id.vercel.app";

  return c.json({
    ok: true,
    service: "iam",
    name: "HNam IAM Service",
    version: "2.0.0",
    status: "online",
    environment: c.env.ENVIRONMENT || "production",
    issuer,
    webUrl,
    endpoints: {
      health: `${issuer}/health`,
      openid_configuration: `${issuer}/.well-known/openid-configuration`,
      jwks: `${issuer}/.well-known/jwks.json`,
      token: `${issuer}/oauth/token`,
      userinfo: `${issuer}/oauth/userinfo`,
      authorize: `${issuer}/oauth/authorize`,
      clients: `${issuer}/api/clients`,
    },
    docs: "https://workers-hub.hnamhocit.workers.dev/workers/iam/overview/",
    timestamp: new Date().toISOString(),
  });
});

// 3. Health check endpoint
app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "iam",
    status: "healthy",
    domain: "iam.hnamhocit.workers.dev",
    environment: c.env.ENVIRONMENT || "production",
    timestamp: new Date().toISOString(),
  });
});

// 4. Gắn các Route Handlers
const routes = app
  .route("/.well-known", wellKnownRoutes)
  .route("/oauth", oauthRoutes)
  .route("/api/clients", clientsRoutes);

// 5. Xử lý lỗi & 404 tập trung
app.onError(errorHandler);
app.notFound(notFoundHandler);

// 6. Export App cho Cloudflare Workers Fetch Handler
export default app;

// 7. Export Type cho Hono RPC Client
export type AppType = typeof routes;
