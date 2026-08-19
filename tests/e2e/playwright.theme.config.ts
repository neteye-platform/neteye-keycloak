import { defineConfig } from "@playwright/test";

// The Keycloak under test is started externally (tests/compose.test.yaml).
// We only point Playwright at it. The stock image serves under "/" (the "/auth"
// relative path is a build-time option of the produced image); override with
// KC_BASE_URL to test a different deployment, e.g. http://host:8080/auth.
const baseURL = process.env.KC_BASE_URL ?? "http://localhost:8080";

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
