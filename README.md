# neteye-keycloak

The NetEye Keycloak container image: upstream Keycloak plus the NetEye theme
and the three providers NetEye ships.

```text
ghcr.io/neteye-platform/neteye-keycloak
```

## What is in the image

| Component | Version | Source |
| --- | --- | --- |
| Keycloak | 26.6.2 | `quay.io/keycloak/keycloak` |
| `keycloak-bcrypt` | 1.7.0 | [leroyguillaume/keycloak-bcrypt](https://github.com/leroyguillaume/keycloak-bcrypt) |
| `keycloak-home-idp-discovery` | 26.2.2 | [sventorben/keycloak-home-idp-discovery](https://github.com/sventorben/keycloak-home-idp-discovery) |
| `keycloak-oidc-groups-mapper` | 1.2.1 | [neteye-platform/keycloak-oidc-groups-mapper](https://github.com/neteye-platform/keycloak-oidc-groups-mapper) |
| NetEye theme | — | `themes/neteye/` in this repository |

The image tag carries the image's own SemVer, not the Keycloak version, so the
versions above are also recorded as labels:

```sh
docker inspect --format '{{json .Labels}}' ghcr.io/neteye-platform/neteye-keycloak:1.0.0
```

All three providers are consumed as release jars. There is no way to add a jar
to the image other than declaring it in the `Dockerfile`, which keeps the
contents reproducible and visible to Renovate.

## Configuration

Only build-time options are baked in — those that decide which JDBC driver is
compiled in, which endpoints exist and under which path the server is served:

| Option | Value |
| --- | --- |
| `--db` | `mariadb` |
| `--health-enabled` | `true` |
| `--metrics-enabled` | `true` |
| `--http-relative-path` | `/auth` |

### Database

The published image is built for MariaDB only: `kc.sh build --db=mariadb`
compiles in the MariaDB JDBC driver and no other, matching the database NetEye
ships (`db=mariadb` in `conf/keycloak.conf` of the `keycloak` RPM). Pointing the
image at PostgreSQL or another engine by setting `KC_DB` at runtime does not
work and fails at start-up.

`KC_DB` is a build argument, so another engine means another image:

```sh
docker build --build-arg KC_DB=postgres -t neteye-keycloak:postgres .
```

Everything else is runtime configuration and is supplied by the deployment:
database host and credentials, hostname, certificates, proxy headers. The image
runs `start --optimized`, so changing a build-time option at runtime fails
loudly instead of silently re-augmenting the server on every start. Such a
change needs a new image.

The full set of server options is documented upstream:
<https://www.keycloak.org/server/all-config>.

## Local development

```sh
docker compose -f compose.dev.yaml up --build
```

Keycloak comes up on <http://localhost:8080/auth> with `admin` / `admin`,
backed by a throwaway MariaDB. The credentials and settings in `compose.dev.yaml`
are illustrative only.

## Testing

Both suites (theme and plugins) run the built image itself — Keycloak plus the
NetEye theme and the three providers, baked with `kc.sh build` for MariaDB —
started against the same MariaDB it ships with and exercised through Keycloak's
real HTTP flows with Playwright. The theme is tested the way it ships: baked
into the image, including real email rendering captured by a Mailpit SMTP sink.
The plugin suite drives a real brokered login through `keycloak-home-idp-discovery`
and `keycloak-oidc-groups-mapper`, and a local login proves passwords are
hashed with `keycloak-bcrypt`.

The image is built once per pull request and shared by both suites
([`.github/workflows/tests.yaml`](.github/workflows/tests.yaml)). See
[`tests/README.md`](tests/README.md) for how to run them locally and what
they cover.

## Releasing

Pull requests build the image without publishing it. Pushing a `v*.*.*` tag
builds and pushes to `ghcr.io` and creates the GitHub release, through the
shared `build-docker-image` workflow from `repo-commons`:

```sh
git tag v1.0.0
git push origin v1.0.0
```

Upgrading Keycloak or a provider means bumping the corresponding `ARG` in the
`Dockerfile` — Renovate opens those pull requests — and then tagging a new image
version.
