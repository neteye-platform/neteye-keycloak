import { defineConfig } from "@playwright/test";

// Plugin compatibility suite. It runs against the IMAGE THIS REPOSITORY BUILDS
// (localhost/neteye-keycloak:test started by tests/plugin/compose.plugin.yaml),
// which serves under "/auth" and imports the plugin-test realm. Kept separate
// from the theme suite so each CI job only spins up the harness it needs.
const baseURL = process.env.KC_BASE_URL ?? "http://localhost:8081/auth";

export default defineConfig({
    testDir: "./specs/plugins",
    timeout: 30_000,
    fullyParallel: true,
    retries: 0,
    reporter: [["list"]],
    // Host-side login-sync mock; compose.plugin.yaml documents how the
    // container reaches it.
    webServer: [
        {
            command: "node ../plugin/mock-receiver/server.mjs",
            url: "http://127.0.0.1:9099/healthz",
            reuseExistingServer: !process.env.CI,
            timeout: 15_000,
        },
    ],
    use: {
        baseURL,
    },
});
