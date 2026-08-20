import { defineConfig } from "@playwright/test";

// The Keycloak under test is the IMAGE THIS REPOSITORY BUILDS
// (localhost/neteye-keycloak:test started by tests/compose.test.yaml), which
// serves under "/auth" and imports the neteye-test realm. Override with
// KC_BASE_URL to test a different deployment.
const baseURL = process.env.KC_BASE_URL ?? "http://localhost:8080/auth";

export default defineConfig({
    testDir: "./specs/theme",
    timeout: 30_000,
    fullyParallel: true,
    retries: 0,
    reporter: [["list"]],
    use: {
        baseURL,
    },
});
