import type { GlobalContext, OpenAPI3 } from "../types.js";
import transformComponentsObject from "./components-object.js";
import { transformExpress } from "./express-object.js";
import transformPathsObject from "./paths-object.js";
import transformWebhooksObject from "./webhooks-object.js";

/** transform top-level schema */
export function transformSchema(schema: OpenAPI3, ctx: GlobalContext): Record<string, string> {
  if (!schema) return {};

  const output: Record<string, string> = {};

  // paths
  if (schema.paths) output.paths = transformPathsObject(schema.paths, ctx);
  else output.paths = "";

  // webhooks
  if (schema.webhooks) output.webhooks = transformWebhooksObject(schema.webhooks, ctx);
  else output.webhooks = "";

  // components
  if (schema.components) output.components = transformComponentsObject(schema.components, ctx);
  else output.components = "";

  if (schema.paths) Object.assign(output, transformExpress(schema.paths, ctx));

  return output;
}
