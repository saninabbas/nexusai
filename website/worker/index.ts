/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleCustomerRoute, runDueTenantBatch } from "./trading/customer";
import { handleTradingRoute } from "./trading/routes";
import { handleAdminRoute } from "./trading/admin";
import { runDailyBlogAutomation } from "./trading/blog-automation";
import type { TradingEnv } from "./trading/types";

interface Env extends TradingEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const adminResponse = await handleAdminRoute(request, env);
    if (adminResponse) return adminResponse;

    const customerResponse = await handleCustomerRoute(request, env);
    if (customerResponse) return customerResponse;

    const tradingResponse = await handleTradingRoute(request, env);
    if (tradingResponse) return tradingResponse;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.allSettled([
      runDueTenantBatch(env),
      runDailyBlogAutomation(env),
    ]));
  },
};

export default worker;
