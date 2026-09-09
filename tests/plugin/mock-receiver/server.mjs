// Host-side mock of the PermissionSync receiver (node:http only, started
// by the Playwright webServer). The fail set is keyed per username on
// purpose: a global 503 toggle would starve every concurrent login in the
// fullyParallel suite.

import { createServer } from "node:http";

const port = Number(process.env.MOCK_PORT ?? 9099);
const MAX_BODY_BYTES = 1_000_000;

const received = [];
const failUsers = new Set();

function reply(res, status, body, type = "application/json") {
    const data = type === "application/json" ? JSON.stringify(body) : body;
    res.writeHead(status, { "Content-Type": type });
    res.end(data);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function parseJson(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://placeholder");
    const path = url.pathname;

    if (req.method === "GET" && path === "/healthz") {
        reply(res, 200, "ok", "text/plain");
        return;
    }

    if (req.method === "POST" && path === "/sync") {
        const payload = parseJson(await readBody(req));
        if (payload === undefined || payload === null || typeof payload !== "object") {
            reply(res, 400, { status: "bad json" });
            return;
        }
        const username = payload.username;
        received.push({
            receivedAt: new Date().toISOString(),
            username,
            // Record only the PRESENCE of the bearer token, never its value.
            authorizationPresent: String(req.headers.authorization ?? "").startsWith(
                "Bearer ",
            ),
            payload,
        });
        // Never log payload content: it carries user identities.
        if (typeof username === "string" && failUsers.has(username)) {
            reply(res, 503, { status: "down" });
            return;
        }
        reply(res, 200, { status: "ok" });
        return;
    }

    if (req.method === "GET" && path === "/received") {
        reply(res, 200, received);
        return;
    }

    if (req.method === "DELETE" && path === "/received") {
        received.length = 0;
        reply(res, 200, { status: "cleared" });
        return;
    }

    if (req.method === "POST" && path === "/fail-users") {
        const body = parseJson(await readBody(req));
        if (typeof body?.username !== "string" || body.username === "") {
            reply(res, 400, { status: "username required" });
            return;
        }
        failUsers.add(body.username);
        reply(res, 200, { status: "failing" });
        return;
    }

    const unfail = path.match(/^\/fail-users\/([^/]+)$/);
    if (req.method === "DELETE" && unfail) {
        failUsers.delete(decodeURIComponent(unfail[1]));
        reply(res, 200, { status: "not failing" });
        return;
    }

    reply(res, 404, { status: "not found" });
});

server.listen(port, "0.0.0.0", () => {
    console.log(`login-sync mock receiver listening on 0.0.0.0:${port}`);
});
