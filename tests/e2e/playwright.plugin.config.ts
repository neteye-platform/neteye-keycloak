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
    use: {
        baseURL,
    },
});
