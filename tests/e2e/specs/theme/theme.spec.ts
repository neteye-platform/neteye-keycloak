import { test, expect, type Page, type APIResponse } from "@playwright/test";

// The theme runs in the built image, served under "/auth" (KC_HTTP_RELATIVE_PATH).
const BASE = process.env.KC_BASE_URL ?? "http://localhost:8080/auth";
const REALM = process.env.KC_TEST_REALM ?? "neteye-test";
const ACCOUNT = `${BASE}/realms/${REALM}/account/`;

// Login request for the public test client. A valid redirect_uri lets the auth
// server render the real login page instead of an error page.
function loginUrl() {
    return (
        `${BASE}/realms/${REALM}/protocol/openid-connect/auth` +
        `?client_id=neteye-test` +
        `&response_type=code` +
        `&scope=openid` +
        `&redirect_uri=${encodeURIComponent(ACCOUNT)}`
    );
}

// Fail the test if the page surfaced any browser/console/network error that
// points at our theme (templates that throw surface as 500s or console
// errors; broken resource references surface as failed requests).
async function assertNoThemeErrors(page: Page, label: string) {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failed: string[] = [];

    page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("requestfailed", (r) =>
        failed.push(`${r.url()} (${r.failure()?.errorText ?? "error"})`),
    );

    // Let any late async requests settle.
    await page.waitForTimeout(1500);

    expect(consoleErrors, `${label}: console errors`).toEqual([]);
    expect(pageErrors, `${label}: page errors`).toEqual([]);
    expect(failed, `${label}: failed requests`).toEqual([]);
}

async function collectAssetUrls(page: Page): Promise<string[]> {
    const urls = new Set<string>();
    for (const el of await page.locator("link, script, img").all()) {
        const u =
            (await el.getAttribute("href")) ?? (await el.getAttribute("src"));
        if (u) urls.add(new URL(u, page.url()).pathname);
    }
    const inline = await page
        .locator("style")
        .evaluateAll((els) =>
            els.map((e) => (e as HTMLElement).textContent ?? ""),
        );
    return [
        ...urls,
        ...inline.flatMap((css) =>
            [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]),
        ),
    ];
}

test("login page renders with NetEye branding", async ({ page }) => {
    const res = await page.goto(loginUrl(), { waitUntil: "domcontentloaded" });
    expect(
        res?.status(),
        "login page must return 200, not a template 500",
    ).toBe(200);

    // The NetEye logo from footer.ftl -- proof the custom footer rendered.
    await expect(page.locator('img[alt="NetEye Logo"]')).toBeVisible();
    // Header links from footer.ftl.
    await expect(page.getByRole("link", { name: "User Guide" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Help Desk" })).toBeVisible();

    // The inherited login form must be present.
    await expect(page.locator("input#username")).toBeVisible();
    await expect(page.locator("input#password")).toBeVisible();

    await assertNoThemeErrors(page, "login");
});

test("theme static resources are served", async ({ page }) => {
    await page.goto(loginUrl(), { waitUntil: "domcontentloaded" });

    const bad: string[] = [];
    for (const asset of await collectAssetUrls(page)) {
        if (!asset.includes("/resources/")) continue;
        const res: APIResponse = await page.request.get(asset, {
            maxRedirects: 5,
        });
        if (!res.ok()) bad.push(`${asset} -> ${res.status()}`);
    }
    expect(bad, "theme resources must all be served").toEqual([]);

    await assertNoThemeErrors(page, "resources");
});

test("account console loads with the theme active", async ({ page }) => {
    const res = await page.goto(ACCOUNT, {
        waitUntil: "domcontentloaded",
    });
    expect(res?.status(), "account console must not 500").toBe(200);

    await assertNoThemeErrors(page, "account");
});
