const originalFetch = window.fetch;
window.fetch = function () {
    return originalFetch.apply(this, arguments).then(function (data) {
        if (data.url.endsWith('/auth/admin/serverinfo') && [401, 403].includes(data.status)) {
            document.querySelector("body").innerHTML = "<div id='kc-unauthorized'>Unauthorized</div>";
        }
        return data;
    });
};
