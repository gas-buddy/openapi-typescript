import type { GlobalContext, OperationObject, PathItemObject } from "../types.js";
import { comment, tsReadonly } from "../utils.js";
import { transformHeaderObjMap } from "./headers.js";
import { operationRequestType, queryStringType, transformOperationObj } from "./operation.js";
import { getOperationId, getOperationIdFromPath, transformPathsObj } from "./paths.js";
import { transformRequestBodies } from "./request.js";
import { getResponseTypes, transformResponsesObj } from "./responses.js";
import { transformSchemaObjMap } from "./schema.js";

const httpMethods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export function transformAll(schema: any, ctx: GlobalContext): Record<string, string> {
  const readonly = tsReadonly(ctx.immutableTypes);
  const output: Record<string, string> = {};
  const operations: Record<string, { operation: OperationObject; pathItem: PathItemObject }> = {};

  // --raw-schema mode
  if (ctx.rawSchema) {
    const required = new Set(Object.keys(schema));
    switch (ctx.version) {
      case 2: {
        output.definitions = transformSchemaObjMap(schema, { ...ctx, required });
        return output;
      }
      case 3: {
        output.schemas = transformSchemaObjMap(schema, { ...ctx, required });
        return output;
      }
    }
  }

  // #/paths (V2 & V3)
  output.paths = ""; // open paths
  if (schema.paths) {
    output.paths += transformPathsObj(schema.paths, {
      ...ctx,
      globalParameters: (schema.components && schema.components.parameters) || schema.parameters,
      operations,
    });
  }

  switch (ctx.version) {
    case 2: {
      // #/definitions
      if (schema.definitions) {
        output.definitions = transformSchemaObjMap(schema.definitions, {
          ...ctx,
          required: new Set(Object.keys(schema.definitions)),
        });
      }

      // #/parameters
      if (schema.parameters) {
        output.parameters = transformSchemaObjMap(schema.parameters, {
          ...ctx,
          required: new Set(Object.keys(schema.parameters)),
        });
      }

      // #/parameters
      if (schema.responses) {
        output.responses = transformResponsesObj(schema.responses, ctx);
      }
      break;
    }
    case 3: {
      // #/components
      output.components = "";

      if (schema.components) {
        // #/components/schemas
        if (schema.components.schemas) {
          output.components += `  ${readonly}schemas: {\n    ${transformSchemaObjMap(schema.components.schemas, {
            ...ctx,
            required: new Set(Object.keys(schema.components.schemas)),
          })}\n  }\n`;
        }

        // #/components/responses
        if (schema.components.responses) {
          output.components += `  ${readonly}responses: {\n    ${transformResponsesObj(
            schema.components.responses,
            ctx
          )}\n  }\n`;
        }

        // #/components/parameters
        if (schema.components.parameters) {
          output.components += `  ${readonly}parameters: {\n    ${transformSchemaObjMap(schema.components.parameters, {
            ...ctx,
            required: new Set(Object.keys(schema.components.parameters)),
          })}\n  }\n`;
        }

        // #/components/requestBodies
        if (schema.components.requestBodies) {
          output.components += `  ${readonly}requestBodies: {\n    ${transformRequestBodies(
            schema.components.requestBodies,
            ctx
          )}\n  }\n`;
        }

        // #/components/headers
        if (schema.components.headers) {
          output.components += `  ${readonly}headers: {\n    ${transformHeaderObjMap(schema.components.headers, {
            ...ctx,
            required: new Set<string>(),
          })}\n  }\n`;
        }
      }
      break;
    }
  }

  // #/operations
  output.operations = "";
  if (Object.keys(operations).length) {
    for (const id of Object.keys(operations)) {
      const { operation, pathItem } = operations[id];
      if (operation.description) output.operations += comment(operation.description); // handle comment
      output.operations += `  ${readonly}"${id}": {\n    ${transformOperationObj(operation, {
        ...ctx,
        pathItem,
        globalParameters: (schema.components && schema.components.parameters) || schema.parameters,
      })}\n  }\n`;
    }
  }

  // Express type definitions
  output.express = "";
  if (Object.keys(operations).length) {
    for (const id of Object.keys(operations)) {
      const { operation, pathItem } = operations[id];
      const typeArgs = {
        ...ctx,
        pathItem,
        globalParameters: (schema.components && schema.components.parameters) || schema.parameters,
      };
      output.express += ` "${id}": {
    responses: ${operation.responses ? getResponseTypes(id, operation.responses) : "void"};
    request: expressRequest<Request<${operationRequestType(id, operation, typeArgs)}>, SLocals, ${queryStringType(
        id,
        operation,
        typeArgs
      )}>;
    response: Response<express<SLocals, RLocals>["${id}"]["responses"]>;
    handler: (req: express<SLocals, RLocals>["${id}"]["request"], res: express<SLocals, RLocals>["${id}"]["response"]) => void | Promise<void>;
}\n`;
    }
    // Now write one that is purely path based that points to express so that handlers
    // have an easier time mapping their types (I don't generally like operationIds for this reason,
    // but I see the argument for callers)
    output.handlers = "";
    for (const [path, methods] of Object.entries(schema.paths)) {
      output.handlers += ` ${getOperationIdFromPath(path)}: {\n`;
      for (const [method, op] of Object.entries(methods as Record<string, { operationId?: string }>)) {
        if (httpMethods.includes(method as any)) {
          output.handlers += ` ${method}: express<SLocals, RLocals>["${getOperationId(op, method, path)}"]["handler"]\n`;
        }
      }
      output.handlers += ` }\n`;
    }
  }

  // cleanup: trim whitespace
  for (const k of Object.keys(output)) {
    if (typeof output[k] === "string") {
      output[k] = output[k].trim();
    }
  }

  return output;
}
