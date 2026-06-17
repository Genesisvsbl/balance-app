import { onRequestPost as login } from "../functions/api/auth-login.js";
import { onRequestDelete as deleteRun } from "../functions/api/balance-run.js";
import {
  onRequestDelete as deleteRuns,
  onRequestGet as getRuns,
  onRequestPost as createRun,
} from "../functions/api/balance-runs.js";

function methodNotAllowed() {
  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: {
      "content-type": "application/json",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const context = { request, env };

    if (url.pathname === "/api/auth-login") {
      if (request.method === "POST") return login(context);
      return methodNotAllowed();
    }

    if (url.pathname === "/api/balance-runs") {
      if (request.method === "GET") return getRuns(context);
      if (request.method === "POST") return createRun(context);
      if (request.method === "DELETE") return deleteRuns(context);
      return methodNotAllowed();
    }

    if (url.pathname === "/api/balance-run") {
      if (request.method === "DELETE") return deleteRun(context);
      return methodNotAllowed();
    }

    return env.ASSETS.fetch(request);
  },
};
