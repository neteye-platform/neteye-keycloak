<#macro content>
  <div class="neteye-login-footer">
    <#--  Need help? <a href="${properties.customer_portal_url}" target="_blank">Contact Support</a>  -->

    <div class="neteye-header">
      <div class="neteye-header-logo">
        <img src="${url.resourcesPath}/img/neteye-logo.svg" alt="NetEye Logo" />
      </div>
      <div class="neteye-header-links">
        <a href="https://www.neteye.guide/${properties.neteye_version}" target="_blank">
          <img src="${url.resourcesPath}/img/document.svg" alt="User Guide" />
          <span>User Guide</span>
        </a>
        <a href="${properties.customer_portal_url}" target="_blank">
          <img src="${url.resourcesPath}/img/help-desk.svg" alt="Help Desk" />
          <span>Help Desk</span>
        </a>
      </div>
    </div>
  </div>
</#macro>
