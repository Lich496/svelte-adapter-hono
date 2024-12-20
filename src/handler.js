import "SHIMS";
import process from "node:process";
import { Server } from "SERVER";
import { manifest, prerendered } from "MANIFEST";
import { env } from "ENV";
import { Hono } from "hono";
import { getConnInfo, serveStatic } from "hono/deno";

const server = new Server(manifest);

const xff_depth = parseInt(env("XFF_DEPTH", "1"));
const address_header = env("ADDRESS_HEADER", "").toLowerCase();

await server.init({ env: process.env });

/** @type {import('hono').MiddlewareHandler} */
const ssr = async (c) => {
  /** @type {Request} */
  const request = c.req.raw;
  const response = await server.respond(request, {
    getClientAddress: () => {
      if (address_header) {
        const value = (request.headers.get(address_header)) || "";

        if (address_header === "x-forwarded-for") {
          const addresses = value.split(",");

          if (xff_depth < 1) {
            throw new Error(
              `${ENV_PREFIX + "XFF_DEPTH"} must be a positive integer`
            );
          }

          if (xff_depth > addresses.length) {
            throw new Error(
              `${ENV_PREFIX + "XFF_DEPTH"} is ${xff_depth}, but only found ${
                addresses.length
              } addresses`
            );
          }
          return addresses[addresses.length - xff_depth].trim();
        }

        return value;
      }

      return getConnInfo(c).remote.address;
    },
  });
  c.status(response.status);
  response.headers.forEach((n, h) => c.header(n, h));
  c.body(response.body);
};

const serve_prerendered = new Hono().use((c, next) =>
  prerendered.has(c.req.path)
    ? serveStatic({ root: "./prerendered/" })(c, next)
    : next()
);

export const handler = new Hono()
  .use("/client/*", serveStatic({ root: "./" }))
  .use("/static/*", serveStatic({ root: "./" }))
  .route("/prerendered/*", serve_prerendered)
  .use(ssr);
