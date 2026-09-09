# Tests

Two Playwright suites cover this image, both run on every pull request
(`.github/workflows/tests.yaml`): the **theme** and the **plugins**. Both run
the image this repository actually builds — `localhost/neteye-keycloak:test`,
i.e. Keycloak plus the NetEye theme and the four providers, baked with
`kc.sh build` for MariaDB — against the MariaDB it ships with.

The theme is tested the way it ships: baked into the image, exercised through
Keycloak's real HTTP flows with Playwright. Email templates are rendered for
real too, captured by a Mailpit SMTP sink. The plugin suite additionally
drives the four providers (bcrypt, home IdP discovery, OIDC groups mapper,
login sync).

The image is built once per pull request and reused by both suites, so a PR
never builds it more than once.

## Layout

| File | Purpose |
| --- | --- |
| `compose.test.yaml` | theme harness: MariaDB + Mailpit + built image |
| `realm-test.json` | theme realm `neteye-test`, imported at startup |
| `plugin/compose.plugin.yaml` | plugin harness: MariaDB + built image |
| `e2e/` | Playwright suites and configs |
| `e2e/specs/theme/theme.spec.ts` | login, account console, resources |
| `e2e/specs/theme/email.spec.ts` | email layout coverage via Mailpit |
| `e2e/specs/plugins/plugins.spec.ts` | bcrypt, home-idp, groups mapper |
| `e2e/specs/plugins/login-sync.spec.ts` | login-sync delivery, fail-closed |

## Prerequisites

- `docker` (or `podman`, which accepts the same `docker compose` commands) with
  native compose support;
- Node.js 22 to run Playwright.

The image must be built once before either suite can run:
`docker build -t localhost/neteye-keycloak:test .` from the repo root.

## Running the theme suite locally

```sh
# 1. build the image (from repo root)
docker build -t localhost/neteye-keycloak:test .

# 2. start the harness (Keycloak on :8080/auth, Mailpit API on :8025)
docker compose -f tests/compose.test.yaml up -d

# 3. wait until the test realm is served
until curl -sf http://localhost:8080/auth/realms/neteye-test; do sleep 2; done

# 4. install the Playwright deps (once) and the browser
cd tests/e2e
npm ci
npx playwright install --with-deps chromium

# 5. run the suite
npx playwright test -c playwright.theme.config.ts

# 6. tear down
cd .. && docker compose -f tests/compose.test.yaml down -v
```

The built image serves under `/auth` (a build-time option of the produced
image), so the realm's registered redirect URIs, the suite's `KC_BASE_URL` and
the wait loop all use `http://localhost:8080/auth`. The bootstrap `admin` /
`admin` account is created automatically.

Every spec also fails if the page surfaces a console, page or network error that
points at the theme, so a template that throws (a 500) or a broken asset
reference is reported explicitly.

## What is covered

- **Login** (`login page renders with NetEye branding`): the NetEye login page
  renders, including the custom footer (`footer.ftl`), and the inherited login
  form is present.
- **Static resources** (`theme static resources are served`): every
  `url()`/`src`/`href` resource the rendered page references returns 200.
- **Account console** (`account console loads with the theme active`): the
  account console renders without template or asset errors.
- **Email** (`email templates render the NetEye layout`): triggers a real
  `send-verify-email` through the Admin REST API, captures the message from
  Mailpit and asserts our email `template.ftl` layout (logo, `Support Desk`,
  footer) actually rendered.

The last CI step additionally scans the Keycloak log for any FreeMarker /
"template not found" error raised during the whole run. This catches render
paths the specs do not open directly (for example `select-authenticator.ftl`,
which only appears when a user can choose between several authenticators):
if a template fails to parse or render while Keycloak is serving the tests, the
run fails instead of silently degrading to the default look.

## Configuration

The suite reads these environment variables (defaults in parentheses):

- `KC_BASE_URL` (`http://localhost:8080/auth`) — Keycloak under test;
- `MAILPIT_URL` (`http://localhost:8025`) — Mailpit HTTP API;
- `KC_TEST_REALM` (`neteye-test`) — realm the specs and helpers use.

## Reproducibility

Every moving part is pinned and tracked by Renovate:

- Keycloak, Mailpit and MariaDB are fixed by tag **and** manifest digest in
  the compose files;
- Playwright is pinned in `tests/e2e/package.json` and `package-lock.json`;
- the GitHub Actions are pinned by commit SHA in `tests.yaml`.

## Plugin suite

The plugin suite runs the same `localhost/neteye-keycloak:test` image but
exercises the four providers through Keycloak's real HTTP flows against the
image's MariaDB (`tests/plugin/compose.plugin.yaml`), on `:8081`.

### Plugin layout

| File | Purpose |
| --- | --- |
| `plugin/compose.plugin.yaml` | MariaDB + the built image harness |
| `plugin/realm-plugins.json` | SP realm `plugin-test`, brokered IdP |
| `plugin/realm-upstream.json` | IdP realm `upstream` (broker target) |
| `plugin/mock-receiver/server.mjs` | host-side login-sync mock receiver |
| `e2e/specs/plugins/plugins.spec.ts` | bcrypt, home-idp, groups mapper |
| `e2e/specs/plugins/login-sync.spec.ts` | login-sync delivery, fail-closed |
| `e2e/playwright.plugin.config.ts` | Playwright config for the plugin suite |

### Running the plugin suite

```sh
# 1. build the image (from repo root)
docker build -t localhost/neteye-keycloak:test .

# 2. start the harness (Keycloak on :8081, served under /auth)
docker compose -f tests/plugin/compose.plugin.yaml up -d

# 3. wait until the plugin realm is served
until curl -sf http://localhost:8081/auth/realms/plugin-test; do
  sleep 2
done

# 4. run the suite (npm deps installed once, as in the theme section; the
#    login-sync mock receiver is started automatically by the webServer)
cd tests/e2e
npm ci
npx playwright install --with-deps chromium
npx playwright test -c playwright.plugin.config.ts

# 5. tear down (the volume holds the import; -v drops it so the next run is clean)
cd .. && docker compose -f tests/plugin/compose.plugin.yaml down -v
```

The two realms make the brokering real: `upstream` is the identity provider
(`upstream-idp`), and every login to `plugin-test` that types an email on the
managed domain `@neteye.example` is forwarded there by
`keycloak-home-idp-discovery`. The user `alice` in `upstream` belongs to the
group `admins`; on the brokered login `keycloak-oidc-groups-mapper` maps the
`groups` claim into `plugin-test` as the `upstream-idp/-admins` group. The
bcrypt test logs in a local user (an email on the unmanaged `@local.example`
domain, so discovery leaves it local) and checks both that its stored
credential is hashed with `bcrypt` and that a correct password signs in while
a wrong one is rejected.

login-sync is exercised against a host-side zero-dependency mock receiver
(`plugin/mock-receiver/server.mjs`) that the Playwright `webServer` starts on
`:9099` before the suite; the container reaches it because
`compose.plugin.yaml` maps `localhost` to `host-gateway`, so the provider's
`http://localhost:9099/sync` endpoint lands on the host. The fail-closed
contract is covered per user: the mock answers `503` only for usernames on
its fail list, so the blocked login is the test's own user and the parallel
specs keep signing through a `200`.

### Plugin coverage

- **bcrypt** (`bcrypt provider hashes passwords with bcrypt`): a password set
  on a local user is stored with the bcrypt credential provider (`algorithm` is
  `bcrypt`), a correct password signs the browser in, and a wrong one is
  rejected.
- **Home IdP discovery** (`home idp discovery forwards a domain user to the
  home identity provider`): typing an email on the managed domain forwards the
  browser to the configured IdP realm's login.
- **OIDC groups mapper** (`oidc groups mapper grants the upstream group
  membership`): after the brokered login, the federated user is a member of the
  IDP-namespaced group mapped from the upstream `groups` claim.
- **login-sync delivery** (`login synchronization delivers the authenticated
  user to the receiver`): a browser login reaches the mock as one
  bearer-authenticated POST whose payload carries `event_type`, `username`
  and `groups`, and the login proceeds.
- **login-sync fail-closed** (`login synchronization fails closed when the
  receiver rejects`): with the mock answering `503` for that user, the
  login is blocked with the provider's error page; once the user leaves the
  fail list the same user signs in normally.

Each test creates or resets its own users at run time through the Admin REST
API, so the suite is deterministic and independent of the imported realm's
seed state. The password used for the brokered login is reset via the Admin API
rather than read from `realm-upstream.json`. The plugin job runs on every
pull request alongside the theme job in
`.github/workflows/tests.yaml`.

### Plugin reproducibility

- MariaDB is fixed by tag **and** manifest digest in
  `compose.plugin.yaml`;
- the provider versions come from the same `ARG`s in the `Dockerfile` that
  Renovate manages for the published image, so the tested providers are exactly
  the ones shipped.
