# NetEye Keycloak image: upstream Keycloak plus the NetEye theme and the three
# providers NetEye ships (bcrypt, home IdP discovery, OIDC groups mapper).
#
# Only build-time options live here. Runtime configuration -- database host and
# credentials, hostname, certificates, proxy settings -- is supplied by the
# deployment, never baked into the image.

ARG KEYCLOAK_VERSION=26.6.2

# Provider versions.
# renovate: datasource=github-releases depName=leroyguillaume/keycloak-bcrypt extractVersion=^v(?<version>.*)$
ARG BCRYPT_VERSION=1.7.0
# renovate: datasource=github-releases depName=sventorben/keycloak-home-idp-discovery extractVersion=^v(?<version>.*)$
ARG HOME_IDP_VERSION=26.2.2
# renovate: datasource=github-releases depName=neteye-platform/keycloak-oidc-groups-mapper extractVersion=^v(?<version>.*)$
ARG OIDC_MAPPER_VERSION=1.2.0

# --- Providers: download the release jars ------------------------------------
# The Keycloak image is UBI-minimal and ships no curl, so fetching happens in a
# separate stage.
FROM docker.io/library/alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS providers
ARG BCRYPT_VERSION
ARG HOME_IDP_VERSION
ARG OIDC_MAPPER_VERSION
# renovate: datasource=repology depName=alpine_3_24/curl versioning=loose
RUN apk add --no-cache curl=8.21.0-r0
WORKDIR /providers
RUN curl -fsSL -O \
        https://github.com/leroyguillaume/keycloak-bcrypt/releases/download/v${BCRYPT_VERSION}/keycloak-bcrypt-${BCRYPT_VERSION}.jar && \
    curl -fsSL -O \
        https://github.com/sventorben/keycloak-home-idp-discovery/releases/download/v${HOME_IDP_VERSION}/keycloak-home-idp-discovery.jar && \
    # note: the repository is "groups" plural, the artifact "group" singular
    curl -fsSL -O \
        https://github.com/neteye-platform/keycloak-oidc-groups-mapper/releases/download/v${OIDC_MAPPER_VERSION}/keycloak-oidc-group-mapper-${OIDC_MAPPER_VERSION}.jar

# --- Build -------------------------------------------------------------------
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}@sha256:f9ba7b2af90db8dc749a57ca9aedca51e840cb9224441ab546a968da941da900 AS build

# Build-time options. Changing any of these requires rebuilding the image:
# they determine which JDBC driver is compiled in, which endpoints exist and
# which path the server is served under. KC_DB matches the database NetEye
# ships (see conf/keycloak.conf in the keycloak RPM: db=mariadb).
ARG KC_DB=mariadb
ARG KC_HTTP_RELATIVE_PATH=/auth

COPY --chown=keycloak:keycloak --from=providers /providers/ /opt/keycloak/providers/
COPY --chown=keycloak:keycloak themes/neteye/ /opt/keycloak/themes/neteye/

RUN /opt/keycloak/bin/kc.sh build \
        --db="${KC_DB}" \
        --health-enabled=true \
        --metrics-enabled=true \
        --http-relative-path="${KC_HTTP_RELATIVE_PATH}"

# --- Final -------------------------------------------------------------------
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}@sha256:f9ba7b2af90db8dc749a57ca9aedca51e840cb9224441ab546a968da941da900

ARG KEYCLOAK_VERSION
ARG BCRYPT_VERSION
ARG HOME_IDP_VERSION
ARG OIDC_MAPPER_VERSION

COPY --from=build /opt/keycloak/ /opt/keycloak/

# The standard OCI labels (source, version, revision, ...) are applied by the
# shared build-docker-image workflow. These record what the tag cannot: the
# image tag carries the image's own SemVer, not the versions inside it.
LABEL com.neteye.keycloak.version="${KEYCLOAK_VERSION}" \
      com.neteye.provider.bcrypt.version="${BCRYPT_VERSION}" \
      com.neteye.provider.home-idp-discovery.version="${HOME_IDP_VERSION}" \
      com.neteye.provider.oidc-groups-mapper.version="${OIDC_MAPPER_VERSION}"

USER 1000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
# --optimized skips the start-up re-augmentation that kc.sh build already did.
# It also turns a build-time option changed at runtime into a hard failure,
# which is the intent: such a change needs a new image, not a silent rebuild.
CMD ["start", "--optimized"]
