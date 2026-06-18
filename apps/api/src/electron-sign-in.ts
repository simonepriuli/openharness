import { electronAuthScheme } from "./env.js";

const REDIRECT_COOKIE_NAME = "better-auth.electron";
const CALLBACK_PATH = "/auth/callback";

/**
 * Browser sign-in page for the Electron OAuth flow.
 *
 * Follows @better-auth/electron/proxy `ensureElectronRedirect` and the docs:
 * OAuth must be started from the browser (not init-oauth-proxy) so the
 * transfer_token cookie survives the GitHub redirect.
 */
export function electronSignInPageHtml(): string {
  const scheme = electronAuthScheme();
  const title = "OpenHarness";

  const body = `
    <p id="headline">Sign in to OpenHarness</p>
    <p id="status">Redirecting to GitHub…</p>
    <button id="retry" type="button" hidden>Try again</button>
    <script>
      (function () {
        var cookieName = ${JSON.stringify(REDIRECT_COOKIE_NAME)};
        var scheme = ${JSON.stringify(scheme)};
        var callbackPath = ${JSON.stringify(CALLBACK_PATH)};
        var oauthStartedKey = "openharness-electron-oauth-started";
        var electronQueryKey = "openharness-electron-query";
        var electronLoopbackKey = "openharness-electron-loopback";
        var timeout = 30000;
        var interval = 100;

        var headline = document.getElementById("headline");
        var status = document.getElementById("status");
        var retry = document.getElementById("retry");

        function setStatus(message) {
          if (status) status.textContent = message;
        }

        function getRedirectCookieValue() {
          var prefix = cookieName + "=";
          var parts = document.cookie.split("; ");
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].indexOf(prefix) === 0) {
              return decodeURIComponent(parts[i].slice(prefix.length));
            }
          }
          return null;
        }

        function redirectToElectronApp(authorizationCode) {
          document.cookie =
            cookieName + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
          setStatus("Returning to OpenHarness…");

          var loopback =
            sessionStorage.getItem(electronLoopbackKey) ||
            new URLSearchParams(window.location.search).get("electron_loopback");

          if (loopback) {
            window.location.replace(
              loopback +
                (loopback.indexOf("?") === -1 ? "?" : "&") +
                "token=" +
                encodeURIComponent(authorizationCode),
            );
            return;
          }

          window.location.replace(
            scheme + ":/" + callbackPath + "?token=" + encodeURIComponent(authorizationCode),
          );
        }

        function ensureElectronRedirect() {
          var start = Date.now();
          var id = setInterval(function () {
            var authorizationCode = getRedirectCookieValue();
            if (authorizationCode) {
              clearInterval(id);
              redirectToElectronApp(authorizationCode);
              return;
            }
            if (Date.now() - start > timeout) {
              clearInterval(id);
              if (headline) headline.textContent = "Sign-in could not be completed";
              setStatus(
                "Could not return to OpenHarness. Try again from the desktop app.",
              );
              if (retry) retry.hidden = false;
            }
          }, interval);
          return id;
        }

        function getStoredElectronQuery() {
          var stored = sessionStorage.getItem(electronQueryKey);
          if (stored) {
            return stored;
          }
          var params = new URLSearchParams(window.location.search);
          if (params.get("client_id") === "electron") {
            return params.toString();
          }
          return null;
        }

        function persistElectronQuery(params) {
          if (params.get("client_id") === "electron") {
            sessionStorage.setItem(electronQueryKey, params.toString());
          }

          var loopback = params.get("electron_loopback");
          if (loopback) {
            sessionStorage.setItem(electronLoopbackKey, loopback);
          }
        }

        /** Docs: electron.transferUser when the web session exists but the redirect cookie was not set. */
        function tryTransferUser() {
          var query = getStoredElectronQuery();
          if (!query) {
            return Promise.resolve(false);
          }

          var callbackURL = window.location.origin + "/api/auth/sign-in";
          return fetch("/api/auth/electron/transfer-user?" + query, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callbackURL: callbackURL }),
          })
            .then(function (response) {
              return response
                .json()
                .catch(function () {
                  return null;
                })
                .then(function (data) {
                  if (!response.ok) {
                    return false;
                  }
                  var authorizationCode = getRedirectCookieValue();
                  if (authorizationCode) {
                    redirectToElectronApp(authorizationCode);
                    return true;
                  }
                  if (data && data.electron_authorization_code) {
                    return false;
                  }
                  return false;
                });
            })
            .catch(function () {
              return false;
            });
        }

        function startGithubOAuth() {
          var params = new URLSearchParams(window.location.search);
          if (params.get("client_id") !== "electron") {
            var stored = sessionStorage.getItem(electronQueryKey);
            if (stored) {
              params = new URLSearchParams(stored);
            }
          }
          persistElectronQuery(params);
          var callbackURL = window.location.origin + "/api/auth/sign-in";
          setStatus("Redirecting to GitHub…");
          if (retry) retry.hidden = true;

          return fetch("/api/auth/sign-in/social?" + params.toString(), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "github", callbackURL: callbackURL }),
          })
            .then(function (response) {
              return response
                .json()
                .catch(function () {
                  return null;
                })
                .then(function (data) {
                  if (data && data.url) {
                    window.location.href = data.url;
                    return;
                  }
                  if (response.redirected) {
                    window.location.href = response.url;
                    return;
                  }
                  throw new Error("Could not start GitHub sign-in");
                });
            })
            .catch(function (error) {
              sessionStorage.removeItem(oauthStartedKey);
              sessionStorage.removeItem(electronQueryKey);
              if (headline) headline.textContent = "Sign-in could not be started";
              setStatus(
                error && error.message
                  ? error.message
                  : "Check that the API is running, then try again.",
              );
              if (retry) retry.hidden = false;
            });
        }

        var params = new URLSearchParams(window.location.search);
        var oauthError = params.get("error");

        if (oauthError) {
          if (headline) headline.textContent = "Sign-in could not be completed";
          setStatus(
            "Error: " +
              oauthError +
              ". Clear cookies for this site, then try again from OpenHarness.",
          );
          if (retry) retry.hidden = false;
          return;
        }

        ensureElectronRedirect();

        var isElectronFlow = params.get("client_id") === "electron";
        var hasRedirectCookie = document.cookie.indexOf(cookieName + "=") !== -1;

        if (hasRedirectCookie) {
          setStatus("Returning to OpenHarness…");
          return;
        }

        var oauthStarted = sessionStorage.getItem(oauthStartedKey) === "1";

        if (!isElectronFlow && !oauthStarted) {
          setStatus("Open this page from the OpenHarness desktop app to sign in.");
          return;
        }

        if (!oauthStarted && isElectronFlow) {
          persistElectronQuery(params);
          sessionStorage.setItem(oauthStartedKey, "1");
          void startGithubOAuth();
          return;
        }

        setStatus("Waiting for sign-in to finish…");
        void tryTransferUser();

        if (retry) {
          retry.addEventListener("click", function () {
            sessionStorage.removeItem(oauthStartedKey);
            var retryParams = new URLSearchParams(getStoredElectronQuery() || "");
            if (retryParams.get("client_id") !== "electron") {
              retryParams = new URLSearchParams(window.location.search);
            }
            persistElectronQuery(retryParams);
            sessionStorage.setItem(oauthStartedKey, "1");
            void startGithubOAuth();
          });
        }
      })();
    </script>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 32rem;
        margin: 4rem auto;
        padding: 0 1rem;
        color: #1a1a1a;
        line-height: 1.5;
      }
      button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        font: inherit;
        cursor: pointer;
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}
