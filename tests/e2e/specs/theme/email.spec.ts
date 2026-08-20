import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE = process.env.KC_BASE_URL ?? "http://localhost:8080/auth";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const REALM = process.env.KC_TEST_REALM ?? "neteye-test";

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

async function newestDeliveredMessage(
    request: APIRequestContext,
    timeoutMs = 15_000,
): Promise<{ ID: string; Subject: string; From: string }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await request.get(`${MAILPIT}/api/v1/messages`);
        const body = (await res.json()) as {
            messages: Array<{
                ID: string;
                Subject: string;
                From: { Address: string };
            }>;
        };
        if (body.messages?.length) {
            return {
                ID: body.messages[0].ID,
                Subject: body.messages[0].Subject,
                From: body.messages[0].From.Address,
            };
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("no email was delivered to Mailpit");
}

test("email templates render the NetEye layout", async ({ request }) => {
    // Start from a clean inbox so the first delivered message is ours.
    await request.delete(`${MAILPIT}/api/v1/messages`);

    const token = await adminToken(request);
    const tokenHeader = auth(token);

    const users = (await (
        await request.get(
            `${BASE}/admin/realms/${REALM}/users?username=testuser`,
            { headers: tokenHeader },
        )
    ).json()) as Array<{ id: string }>;
    const userId = users[0].id;

    // "Verify email" renders email-verification.ftl through our email theme's
    // template.ftl layout and delivers it to the Mailpit SMTP sink.
    const send = await request.put(
        `${BASE}/admin/realms/${REALM}/users/${userId}/send-verify-email`,
        {
            headers: tokenHeader,
        },
    );
    expect(send.status(), "email send must be accepted").toBe(204);

    const msg = await newestDeliveredMessage(request);
    expect(msg.Subject).toBe("Verify email");
    expect(msg.From).toBe("noreply@neteye.example");

    const full = (await (
        await request.get(`${MAILPIT}/api/v1/message/${msg.ID}`)
    ).json()) as { HTML: string };
    const html = full.HTML;
    expect(html).toContain("neteye_logo.png");
    expect(html).toContain("kc-content");
    expect(html).toContain("Support Desk");
    expect(html).toContain("This is an automated message");
});
