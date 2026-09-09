import {
    test,
    expect,
    type APIRequestContext,
    type Page,
} from "@playwright/test";

// Login-sync provider coverage, run against the host-side mock receiver:
// a 200 from the mock lets the login through, a 503 for a fail-listed
// user must block it (fail-closed).
const BASE = process.env.KC_BASE_URL ?? "http://localhost:8081/auth";
const REALM = process.env.KC_TEST_REALM ?? "plugin-test";
const MOCK = process.env.MOCK_RECEIVER_URL ?? "http://127.0.0.1:9099";

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

const loginUrl = (redirect: string) =>
    `${BASE}/realms/${REALM}/protocol/openid-connect/auth` +
    `?client_id=plugin-test-client` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirect)}&scope=openid`;

// The provider's SyncPayload contract: event_type, username, groups.
type SyncRecord = {
    receivedAt: string;
    username: unknown;
    authorizationPresent: boolean;
    payload: {
        event_type?: string;
        username?: string;
        groups?: unknown;
    };
};

async function listReceived(
    request: APIRequestContext,
): Promise<SyncRecord[]> {
    const res = await request.get(`${MOCK}/received`);
    expect(res.ok(), "mock receiver must answer").toBeTruthy();
    return (await res.json()) as SyncRecord[];
}

async function browserLogin(
    page: Page,
    username: string,
    password: string,
): Promise<void> {
    await page.goto(loginUrl(ACCOUNT));
    await page.fill("#username", username);
    await page.click("#kc-login");
    await page.fill("#password", password);
    await page.click("#kc-login");
}

test("login synchronization delivers the authenticated user to the receiver", async ({
    request,
    page,
}) => {
    const USER = "syncuser";
    const token = await adminToken(request);
    await request.delete(`${MOCK}/received`);
    // A stale fail entry from an interrupted run would 503 this login.
    await request.delete(`${MOCK}/fail-users/${USER}`);
    await createUser(request, token, USER, "syncpass");

    await browserLogin(page, USER, "syncpass");
    await page.waitForURL("**/account/**");

    let delivered: SyncRecord | undefined;
    await expect
        .poll(
            async () => {
                const all = await listReceived(request);
                delivered = all.find(
                    (entry) => entry.payload?.username === USER,
                );
                return delivered !== undefined;
            },
            "the provider must POST the login to the receiver",
        )
        .toBe(true);

    expect(delivered!.authorizationPresent, "sync must carry a bearer token").toBe(
        true,
    );
    expect(
        delivered!.payload.groups,
        "payload.groups must be a list of group paths",
    ).toBeInstanceOf(Array);
    expect(delivered!.payload.event_type, "payload must be a LOGIN event").toBe(
        "LOGIN",
    );
});

test("login synchronization fails closed when the receiver rejects", async ({
    request,
    page,
}) => {
    // Its own user and fail-list entry: no global mock state, so the
    // delivery test running in parallel is unaffected.
    const USER = "blockedsync";
    const token = await adminToken(request);
    await request.delete(`${MOCK}/fail-users/${USER}`);
    await createUser(request, token, USER, "blockedpass");

    const fail = await request.post(`${MOCK}/fail-users`, {
        headers: { "Content-Type": "application/json" },
        data: { username: USER },
    });
    expect(fail.ok(), "mock must accept the fail-list entry").toBeTruthy();

    try {
        await browserLogin(page, USER, "blockedpass");
        await expect(
            page.getByText(
                "We could not complete your sign-in. Please try again later.",
            ),
        ).toBeVisible();
        expect(page.url()).toContain("/realms/plugin-test/");
    } finally {
        await request.delete(`${MOCK}/fail-users/${USER}`);
    }

    // With the receiver healthy again the very same user signs in normally.
    await page.context().clearCookies();
    await browserLogin(page, USER, "blockedpass");
    await page.waitForURL("**/account/**");
});
