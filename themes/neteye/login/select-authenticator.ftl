<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>
<!-- template: select-authenticator.ftl -->

    <#if section = "header" || section = "show-username">
        <#if section = "header">
            ${msg("loginChooseAuthenticator")}
        </#if>
    <#elseif section = "form">

    <div class="nt-select-auth-container" role="list">
        <#list auth.authenticationSelections as authenticationSelection>
            <div class="nt-select-auth-item">
                <form id="kc-select-credential-form" class="" action="${url.loginAction}" method="post">
                    <input type="hidden" name="authenticationExecution" value="${authenticationSelection.authExecId}">
                </form>

                <div role="button" class="nt-select-auth-item-button" onclick="document.forms[${authenticationSelection?index}].requestSubmit()" tabindex="0">

                    <div class="nt-select-auth-item-icon">
                        <img src="${url.resourcesPath}/img/password-gray100.svg" class="nt-light-theme" alt="authenticator icon" />
                        <img src="${url.resourcesPath}/img/password-gray10.svg" class="nt-dark-theme" alt="authenticator icon" />
                    </div>

                    <div class="nt-select-auth-item-content">
                        <h2 class="nt-select-auth-item-heading">
                            ${msg('${authenticationSelection.displayName}')}
                        </h2>
                        <div class="nt-select-auth-item-description">
                            ${msg('${authenticationSelection.helpText}')}
                        </div>
                    </div>

                    <div class="nt-select-auth-item-arrow">
                        <img src="${url.resourcesPath}/img/chevron--right-gray100.svg" class="nt-light-theme" alt="arrow icon" />
                        <img src="${url.resourcesPath}/img/chevron--right-gray10.svg" class="nt-dark-theme" alt="arrow icon" />

                    </div>

                </div>
            </div>
        </#list>
    </div>

    </#if>
</@layout.registrationLayout>
