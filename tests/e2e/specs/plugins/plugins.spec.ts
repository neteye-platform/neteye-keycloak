import {
    test,
    expect,
    type APIRequestContext,
    type Page,
} from "@playwright/test";

// Runs against the image this repo builds (tests/plugin/compose.plugin.yaml):
// Keycloak with the three NetEye providers baked in, served under "/auth".
const BASE = process.env.KC_BASE_URL ?? "http://localhost:8081/auth";
const REALM = process.env.KC_TEST_REALM ?? "plugin-test";

function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
}

async function adminToken(request: APIRequestContext): Promise<string> {
    const res = await request.post(
        `${BASE}/realms/master/protocol/openid-connect/token`,
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            form: {
                grant_type: "password",
                client_id: "admin-cli",
                username: "admin",
                password: "admin",
            },
        },
    );
    expect(res.ok(), "bootstrap admin must authenticate").toBeTruthy();
    const body = (await res.json()) as { access_token: string };
    return body.access_token;
}

async function deleteUser(
    request: APIRequestContext,
    token: string,
    realm: string,
    username: string,
): Promise<void> {
    const existing = (await (
        await request.get(
            `${BASE}/admin/realms/${realm}/users?username=${username}`,
            {
                headers: auth(token),
            },
        )
    ).json()) as Array<{ id: string }>;
    for (const u of existing) {
        await request.delete(`${BASE}/admin/realms/${realm}/users/${u.id}`, {
            headers: auth(token),
        });
    }
}

async function createUser(
    request: APIRequestContext,
    token: string,
    username: string,
    password: string,
): Promise<string> {
    // Delete any user left over from a previous run so the test is idempotent.
    await deleteUser(request, token, REALM, username);

    const created = await request.post(`${BASE}/admin/realms/${REALM}/users`, {
        headers: { ...auth(token), "Content-Type": "application/json" },
        data: {
            username,
            // Non-managed domain so home-idp-discovery leaves this user local.
            email: `${username}@local.example`,
            firstName: "NetEye",
            lastName: "Plugin",
            emailVerified: true,
            enabled: true,
            requiredActions: [],
            credentials: [{ type: "password", value: password }],
        },
    });
    expect(created.status(), "user creation must be accepted").toBe(201);

    const list = (await (
        await request.get(
            `${BASE}/admin/realms/${REALM}/users?username=${username}`,
            {
                headers: auth(token),
            },
        )
    ).json()) as Array<{ id: string }>;
    return list[0].id;
}

const ACCOUNT =
    process.env.KC_ACCOUNT_URL ??
    "http://localhost:8081/auth/realms/plugin-test/account/";

const UPSTREAM_REALM = process.env.KC_UPSTREAM_REALM ?? "upstream";
const HOME_DOMAIN = "neteye.example";
const IDP_ALIAS = "upstream-idp";
const UPSTREAM_USER = "alice";
const UPSTREAM_GROUP = "admins";
const UPSTREAM_PASS = process.env.UPSTREAM_PASSWORD ?? "alice-pass";

const loginUrl = (redirect: string) =>
    `${BASE}/realms/${REALM}/protocol/openid-connect/auth` +
    `?client_id=plugin-test-client` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirect)}&scope=openid`;

test("bcrypt provider hashes passwords with bcrypt", async ({
    request,
    page,
}) => {
    // realm-plugins.json sets passwordPolicy "hashAlgorithm(bcrypt)".
    const token = await adminToken(request);
    const userId = await createUser(request, token, "bcryptuser", "bcryptpass");

    // The stored credential must have been hashed with the bcrypt provider.
    const creds = (await (
        await request.get(
            `${BASE}/admin/realms/${REALM}/users/${userId}/credentials`,
            {
                headers: auth(token),
            },
        )
    ).json()) as Array<{
        type: string;
        algorithm?: string;
        credentialData?: string;
    }>;
    const pw = creds.find((c) => c.type === "password");
    expect(pw, "user must have a password credential").toBeTruthy();
    const credentialData = pw!.credentialData
        ? (JSON.parse(pw!.credentialData) as { algorithm?: string })
        : undefined;
    expect(
        credentialData?.algorithm,
        "password must be hashed with bcrypt",
    ).toBe("bcrypt");

    // A correct password must reach the account console. The discovery flow
    // shows the username first, so the password form appears after submit.
    await page.goto(loginUrl(ACCOUNT));
    await page.fill("#username", "bcryptuser");
    await page.click("#kc-login");
    await page.fill("#password", "bcryptpass");
    await page.click("#kc-login");
    await page.waitForURL("**/account/**");
    expect(page.url()).toContain("/account/");

    // A wrong password must be rejected; drop the session cookie first.
    await page.context().clearCookies();
    await page.goto(loginUrl(ACCOUNT));
    await page.fill("#username", "bcryptuser");
    await page.click("#kc-login");
    await page.fill("#password", "wrong-pass");
    await page.click("#kc-login");
    await expect(page.getByText("Invalid username or password")).toBeVisible();
    expect(page.url()).toContain("/realms/plugin-test/");
});

// The broker-backed specs share alice's upstream login, so they run serial.
test.describe.serial("brokered identity providers", () => {
    async function resetUpstreamPassword(
        request: APIRequestContext,
        token: string,
    ): Promise<void> {
        const up = (await (
            await request.get(
                `${BASE}/admin/realms/${UPSTREAM_REALM}/users?username=${UPSTREAM_USER}`,
                { headers: auth(token) },
            )
        ).json()) as Array<{ id: string; username: string }>;
        const alice = up.find((u) => u.username === UPSTREAM_USER);
        expect(
            alice,
            "upstream realm must import the broker user",
        ).toBeTruthy();
        const res = await request.put(
            `${BASE}/admin/realms/${UPSTREAM_REALM}/users/${alice!.id}/reset-password`,
            {
                headers: { ...auth(token), "Content-Type": "application/json" },
                data: {
                    type: "password",
                    value: UPSTREAM_PASS,
                    temporary: false,
                },
            },
        );
        expect(
            res.ok(),
            "upstream password reset must be accepted",
        ).toBeTruthy();
    }

    // Full first-broker-login as the upstream user: fresh federated user, then
    // plugin-test -> upstream -> account console.
    async function brokeredLogin(
        request: APIRequestContext,
        token: string,
        page: Page,
    ): Promise<void> {
        await deleteUser(request, token, REALM, UPSTREAM_USER);
        await resetUpstreamPassword(request, token);
        await page.context().clearCookies();
        await page.goto(loginUrl(ACCOUNT));
        await page.fill("#username", `${UPSTREAM_USER}@${HOME_DOMAIN}`);
        await page.click("#kc-login");
        await page.waitForURL("**/realms/upstream/**");
        await page.fill("#username", UPSTREAM_USER);
        await page.fill("#password", UPSTREAM_PASS);
        await page.click("#kc-login");
        await page.waitForURL("**/account/**");
    }

    test("home idp discovery forwards a domain user to the home identity provider", async ({
        request,
        page,
    }) => {
        const token = await adminToken(request);
        await deleteUser(request, token, REALM, UPSTREAM_USER);
        await resetUpstreamPassword(request, token);
        await page.context().clearCookies();
        await page.goto(loginUrl(ACCOUNT));

        // A username on the managed domain forwards straight to the IdP login.
        await page.fill("#username", `${UPSTREAM_USER}@${HOME_DOMAIN}`);
        await page.click("#kc-login");
        await expect(page).toHaveURL(
            new RegExp(
                `/realms/${UPSTREAM_REALM}/protocol/openid-connect/auth`,
            ),
        );

        // Completing the login proves the forward to the upstream realm works.
        await page.fill("#username", UPSTREAM_USER);
        await page.fill("#password", UPSTREAM_PASS);
        await page.click("#kc-login");
        await page.waitForURL("**/account/**");
    });

    test("oidc groups mapper grants the upstream group membership", async ({
        request,
        page,
    }) => {
        const token = await adminToken(request);
        await brokeredLogin(request, token, page);

        // The upstream groups claim maps onto a group for the federated user.
        const users = (await (
            await request.get(
                `${BASE}/admin/realms/${REALM}/users?username=${UPSTREAM_USER}`,
                { headers: auth(token) },
            )
        ).json()) as Array<{ id: string; username: string }>;
        const federated = users.find((u) => u.username === UPSTREAM_USER);
        expect(
            federated,
            "brokered user must be created in the local realm",
        ).toBeTruthy();
        const groups = (await (
            await request.get(
                `${BASE}/admin/realms/${REALM}/users/${federated!.id}/groups`,
                { headers: auth(token) },
            )
        ).json()) as Array<{ path: string }>;
        expect(
            groups.map((g) => g.path),
            "the groups claim must be mapped onto a group for the federated user",
        ).toContain(`/${IDP_ALIAS}/-${UPSTREAM_GROUP}`);
    });
});
