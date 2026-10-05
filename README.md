# neteye-keycloak

The NetEye Keycloak container image: upstream Keycloak plus the NetEye theme
and the three providers NetEye ships.

```text
ghcr.io/neteye-platform/neteye-keycloak
```

## What is in the image

| Component                     | Version | Source                                                                                                        |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| Keycloak                      | 26.8.0  | `quay.io/keycloak/keycloak`                                                                                   |
| `keycloak-bcrypt`             | 1.7.0   | [leroyguillaume/keycloak-bcrypt](https://github.com/leroyguillaume/keycloak-bcrypt)                           |
| `keycloak-home-idp-discovery` | 26.2.2  | [sventorben/keycloak-home-idp-discovery](https://github.com/sventorben/keycloak-home-idp-discovery)           |
| `keycloak-oidc-groups-mapper` | 1.3.4   | [neteye-platform/keycloak-oidc-groups-mapper](https://github.com/neteye-platform/keycloak-oidc-groups-mapper) |
| NetEye theme                  | —       | `themes/neteye/` in this repository                                                                           |

The image tag carries the image's own SemVer, not the Keycloak version, so the
versions above are also recorded as labels:

```sh
docker inspect --format '{{json .Labels}}' ghcr.io/neteye-platform/neteye-keycloak:1.0.0
```

All three providers are consumed as release jars. There is no way to add a jar
to the image other than declaring it in the `Dockerfile`, which keeps the
contents reproducible and visible to Renovate.

## Configuration

Nothing is baked into the image except the theme, the four provider jars and
`conf/quarkus.properties`. In particular the image does **not** run
`kc.sh build`, because NetEye starts it with a plain `start`: a non-optimized
start discards any build configuration persisted in the image and re-runs the
augmentation from the options in effect at that moment, rewriting
`lib/quarkus/` on every boot. Baking a build would add ~190 MB of artifacts
that are overwritten before they are ever used.

So the four options Keycloak classifies as build-time have to be passed by the
deployment on **every** start, like any other:

| Option                 | Env var                 | Value NetEye uses |
| ---------------------- | ----------------------- | ----------------- |
| `--db`                 | `KC_DB`                 | `mariadb`         |
| `--health-enabled`     | `KC_HEALTH_ENABLED`     | `true`            |
| `--metrics-enabled`    | `KC_METRICS_ENABLED`    | `true`            |
| `--http-relative-path` | `KC_HTTP_RELATIVE_PATH` | `/auth`           |

Omitting one is not reported as an error — the server starts on Keycloak's
default instead. `KC_DB` is the one that matters: its default is `dev-file`,
so a missing `KC_DB` means Keycloak quietly comes up on a local H2 file
database rather than on MariaDB. A missing `KC_HTTP_RELATIVE_PATH` means the
server is served under `/` instead of `/auth`.

The non-optimized start also writes to `/opt/keycloak`, so the container
cannot run with a read-only root filesystem.

### Database

NetEye runs on MariaDB (`db=mariadb` in `conf/keycloak.conf` of the `keycloak`
RPM). The base image ships the JDBC drivers for all engines Keycloak
supports, so pointing the image at another engine is a matter of changing
`KC_DB` — no separate image is needed.

Every new JDBC connection runs `SET SESSION wsrep_sync_wait=1`, shipped in
`conf/quarkus.properties`. NetEye runs Keycloak on a MariaDB Galera cluster,
where without it a node can serve a read that does not yet include a write
already committed cluster-wide; on a single-node MariaDB the statement is
accepted and does nothing. Keycloak has no native option for a connection-init
statement, so it is a raw Quarkus property. It is read on every start and a
deployment can override it with `QUARKUS_DATASOURCE_JDBC_NEW_CONNECTION_SQL`.

Everything else is runtime configuration and is supplied by the deployment too:
database host and credentials, hostname, certificates, proxy headers.

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
NetEye theme and the four providers — started the same way production starts
it (a plain `start`, with the build-time options passed as environment) against
the same MariaDB it ships with and exercised through Keycloak's
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
