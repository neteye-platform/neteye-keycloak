# NetEye Keycloak image: upstream Keycloak plus the NetEye theme and the four
# providers NetEye ships (bcrypt, home IdP discovery, OIDC groups mapper, login
# synchronization).
#
# This image deliberately does NOT run `kc.sh build`. NetEye starts the server
# with a plain `start`, and a non-optimized start discards any build
# configuration persisted in the image and re-runs the augmentation from the
# options in effect at that moment, rewriting lib/quarkus/ on every boot. A
# baked build would add ~190 MB of artifacts overwritten before they are ever
# used.
#
# So nothing is baked in beyond the files copied below: db, http-relative-path,
# health-enabled and metrics-enabled are supplied by the deployment on every
# start, as are the database host and credentials, hostname, certificates and
# proxy settings. The one exception is conf/quarkus.properties, which carries
# no deployment-specific value.

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

# --- Final -------------------------------------------------------------------
FROM quay.io/keycloak/keycloak:26.8.0@sha256:b0f60d489d51c5d113390bdf5461d4c06e6051be026c05549f2e1e10ec352bcc

ARG KEYCLOAK_VERSION
ARG BCRYPT_VERSION
ARG HOME_IDP_VERSION
ARG OIDC_MAPPER_VERSION
ARG LOGIN_SYNC_VERSION

# The OIDC groups mapper reads its own Keycloak provider ID from this env var
# in a static initializer (it cannot be a Keycloak SPI option: getId() must be
# known before Config.Scope is available, see the mapper's own source). It
# defaults to the pre-rename ID so existing NetEye installs upgrading to a
# mapper build with the new default ID ("oidc-group-mapper") keep matching the
# identityProviderMapper value already persisted for configured IdPs.
ARG OIDC_GROUPS_MAPPER_PROVIDER_ID=neteye-oidc-groups-mapper
ENV OIDC_GROUPS_MAPPER_PROVIDER_ID=${OIDC_GROUPS_MAPPER_PROVIDER_ID}

COPY --chown=keycloak:keycloak --from=providers /providers/ /opt/keycloak/providers/
COPY --chown=keycloak:keycloak themes/neteye/ /opt/keycloak/themes/neteye/
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
# This start writes to /opt/keycloak, so the container cannot run with a
# read-only root filesystem.
CMD ["start"]
