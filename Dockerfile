# NetEye Keycloak image: upstream Keycloak plus the NetEye theme and the four
# providers NetEye ships (bcrypt, home IdP discovery, OIDC groups mapper, login
# synchronization).
#
# Only build-time options live here. Runtime configuration -- database host and
# credentials, hostname, certificates, proxy settings -- is supplied by the
# deployment, never baked into the image. The one exception is
# conf/quarkus.properties, which carries no deployment-specific value.

# renovate: datasource=github-releases depName=keycloak/keycloak
ARG KEYCLOAK_VERSION=26.8.0

# Provider versions. The ARG name must end in _VERSION: the shared Renovate
# config picks these up through customManagers:dockerfileVersions, which keys off
# that suffix plus the comment above each ARG.
#
# renovate: datasource=github-releases depName=leroyguillaume/keycloak-bcrypt extractVersion=^v(?<version>.*)$
ARG BCRYPT_VERSION=1.7.0
# renovate: datasource=github-releases depName=sventorben/keycloak-home-idp-discovery extractVersion=^v(?<version>.*)$
ARG HOME_IDP_VERSION=26.2.2
# renovate: datasource=github-releases depName=neteye-platform/keycloak-oidc-groups-mapper extractVersion=^v(?<version>.*)$
ARG OIDC_MAPPER_VERSION=1.3.4
# renovate: datasource=github-releases depName=neteye-platform/keycloak-login-sync-provider extractVersion=^v(?<version>.*)$
ARG LOGIN_SYNC_VERSION=0.1.2

# --- Providers: download the release jars ------------------------------------
# The Keycloak image is UBI-minimal and ships no curl, so fetching happens in a
# separate stage.
FROM docker.io/library/alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 AS providers
ARG BCRYPT_VERSION
ARG HOME_IDP_VERSION
ARG OIDC_MAPPER_VERSION
ARG LOGIN_SYNC_VERSION
# hadolint ignore=DL3018
RUN apk add --no-cache curl
WORKDIR /providers
RUN curl -fsSL -O \
    https://github.com/leroyguillaume/keycloak-bcrypt/releases/download/v${BCRYPT_VERSION}/keycloak-bcrypt-${BCRYPT_VERSION}.jar && \
    curl -fsSL -O \
    https://github.com/sventorben/keycloak-home-idp-discovery/releases/download/v${HOME_IDP_VERSION}/keycloak-home-idp-discovery.jar && \
    # note: the repository is "groups" plural, the artifact "group" singular
    curl -fsSL -O \
    https://github.com/neteye-platform/keycloak-oidc-groups-mapper/releases/download/v${OIDC_MAPPER_VERSION}/keycloak-oidc-group-mapper-${OIDC_MAPPER_VERSION}.jar && \
    curl -fsSL -O \
    https://github.com/neteye-platform/keycloak-login-sync-provider/releases/download/v${LOGIN_SYNC_VERSION}/keycloak-login-sync-provider-${LOGIN_SYNC_VERSION}.jar

FROM quay.io/keycloak/keycloak:26.8.0@sha256:b0f60d489d51c5d113390bdf5461d4c06e6051be026c05549f2e1e10ec352bcc AS keycloak

# --- Build -------------------------------------------------------------------
FROM keycloak AS build

# Build-time options. Changing any of these requires rebuilding the image:
# they determine which JDBC driver is compiled in, which endpoints exist and
# which path the server is served under. KC_DB matches the database NetEye
# ships (see conf/keycloak.conf in the keycloak RPM: db=mariadb).
ARG KC_DB=mariadb
ARG KC_HTTP_RELATIVE_PATH=/auth

# The OIDC groups mapper reads its own Keycloak provider ID from this env var
# in a static initializer (it cannot be a Keycloak SPI option: getId() must be
# known before Config.Scope is available, see the mapper's own source). Because
# the final image runs with --optimized, this value is frozen in at build time
# here, not at container start. It defaults to the pre-rename ID so existing
# NetEye installs upgrading to a mapper build with the new default ID
# ("oidc-group-mapper") keep matching the identityProviderMapper value already
# persisted for configured IdPs.
ARG OIDC_GROUPS_MAPPER_PROVIDER_ID=neteye-oidc-groups-mapper
ENV OIDC_GROUPS_MAPPER_PROVIDER_ID=${OIDC_GROUPS_MAPPER_PROVIDER_ID}

COPY --chown=keycloak:keycloak --from=providers /providers/ /opt/keycloak/providers/
COPY --chown=keycloak:keycloak themes/neteye/ /opt/keycloak/themes/neteye/

RUN /opt/keycloak/bin/kc.sh build \
    --db="${KC_DB}" \
    --health-enabled=true \
    --metrics-enabled=true \
    --http-relative-path="${KC_HTTP_RELATIVE_PATH}"

# --- Final -------------------------------------------------------------------
FROM keycloak

ARG KEYCLOAK_VERSION
ARG BCRYPT_VERSION
ARG HOME_IDP_VERSION
ARG OIDC_MAPPER_VERSION
ARG LOGIN_SYNC_VERSION

# This stage is a sibling of "build", not derived from it, so the ENV set
# there (see the comment above its ARG) does not carry over via COPY. Repeat
# it here with the same default so the mapper's static initializer resolves
# the same provider ID at runtime that was frozen into the --optimized build.
ARG OIDC_GROUPS_MAPPER_PROVIDER_ID=neteye-oidc-groups-mapper
ENV OIDC_GROUPS_MAPPER_PROVIDER_ID=${OIDC_GROUPS_MAPPER_PROVIDER_ID}

COPY --from=build /opt/keycloak/ /opt/keycloak/

# Not copied into "build": the property is a runtime one, so it is read on
# every start and need not be persisted into the optimized build.
COPY --chown=keycloak:keycloak conf/quarkus.properties /opt/keycloak/conf/quarkus.properties

# The standard OCI labels (source, version, revision, ...) are applied by the
# shared build-docker-image workflow. These record what the tag cannot: the
# image tag carries the image's own SemVer, not the versions inside it.
LABEL com.neteye.keycloak.version="${KEYCLOAK_VERSION}" \
    com.neteye.provider.bcrypt.version="${BCRYPT_VERSION}" \
    com.neteye.provider.home-idp-discovery.version="${HOME_IDP_VERSION}" \
    com.neteye.provider.oidc-groups-mapper.version="${OIDC_MAPPER_VERSION}" \
    com.neteye.provider.login-sync.version="${LOGIN_SYNC_VERSION}"

USER 1000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
# --optimized skips the start-up re-augmentation that kc.sh build already did.
# It also turns a build-time option changed at runtime into a hard failure,
# which is the intent: such a change needs a new image, not a silent rebuild.
CMD ["start", "--optimized"]
