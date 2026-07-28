<#macro emailLayout>
<html lang="${locale.language}" dir="${(ltr)?then('ltr','rtl')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; }
  .kc-content p { margin: 0 0 24px; }
  .kc-content p:last-child { margin-bottom: 0; }
  .kc-content h2 { margin: 0 0 16px; font-size: 20px; font-weight: 500; color: #161616; }
  .kc-content a { color: #FFFFFF; background-color: #E30814; display: block; padding: 10px 16px; text-decoration: none; border-radius: 0px; }
  .kc-content a:hover { background-color: #C00610; }

  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #161616 !important; }
    .body-bg { background-color: #262626 !important; }
    .body-text { color: #F4F4F4 !important; }
    .kc-content h2 { color: #F4F4F4 !important; }
    .footer-text { color: #8D8D8D !important; }
    .footer-sep { border-top-color: #525252 !important; }
    .footer-link { color: #8D8D8D !important; }
  }
</style>
</head>
<body class="email-bg body-text" style="margin:0; padding:0; background-color:#FFFFFF; font-family: Helvetica, Arial, sans-serif; font-size:15px; line-height:1.6; color:#161616;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" bgcolor="#FFFFFF" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" class="email-bg" style="padding:32px 16px; background-color:#FFFFFF;">
        <!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" align="center"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="body-bg" bgcolor="#F4F4F4" style="max-width:640px; background-color:#F4F4F4;">
          <tr>
            <td bgcolor="#0D0D0D" style="background-color:#0D0D0D; background-image:linear-gradient(90deg, #0D0D0D 0%, #92140D 100%); padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td height="120" valign="top" style="height:120px; padding:0; background-image:url('https://neteye.guide/static/img/globe.png'); background-repeat:no-repeat; background-position:right bottom; background-size:220px 120px;">
                    <div style="margin:20px;">
                      <img src="https://neteye.guide/static/img/neteye_logo.png" alt="${realmName!'Keycloak'}" width="112" height="20" style="display:block; border:0; color:#F4F4F4; font-size:20px; font-weight:500;">
                    </div>
                  </td>
                  <!--[if mso]>
                  <td align="right" valign="bottom" style="padding:0; font-size:0; line-height:0;">
                    <img src="https://neteye.guide/static/img/globe.png" alt="" width="220" height="120" style="display:block; border:0;">
                  </td>
                  <![endif]-->
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="kc-content body-bg body-text" bgcolor="#F4F4F4" style="padding:32px 20px 64px 20px; font-size:14px; font-weight:400; line-height:1.5; color:#161616; background-color:#F4F4F4;">
              <#nested>
            </td>
          </tr>
          <tr>
            <td class="body-bg footer-text" bgcolor="#F4F4F4" style="padding: 0px 20px 20px 20px; color:#8D8D8D; font-size:12px; background-color:#F4F4F4;">
              <div class="footer-sep" style="border-top:1px solid #C6C6C6; margin-bottom:20px;"></div>
              ${realmName!"Keycloak"} — This is an automated message, please do not reply.
              <br>
              <br>
              <a class="footer-link" href="https://siwuerthphoenix.atlassian.net/servicedesk/customer/portals" style="color:#8D8D8D; text-decoration:underline;">Support Desk</a>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
</#macro>
