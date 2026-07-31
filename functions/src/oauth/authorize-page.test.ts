import { describe, expect, it } from "vitest";

import { SCOPE_READ, type ConnectorConfig } from "../config.js";
import {
  buildContentSecurityPolicy,
  describeRedirectTarget,
  escapeHtml,
  jsonForScript,
  renderAuthorizePage,
  renderErrorPage,
} from "./authorize-page.js";

const ISSUER = "https://connector.example.com/";

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    issuerUrl: new URL(ISSUER),
    resourceUrl: new URL("/mcp", ISSUER),
    firebaseWebConfig: { apiKey: "api-key-123", authDomain: "cadence.example.com", projectId: "p" },
    ...overrides,
  };
}

const REQUEST_ID = "a".repeat(43);
const REDIRECT_URI = "https://client.example.com/callback";

/** The payload an attacker would plant in client_name via unauthenticated DCR. */
const XSS_NAME = `</script><img src=x onerror=alert(1)>`;

function render(
  params: Partial<Parameters<typeof renderAuthorizePage>[1]> = {},
  config: ConnectorConfig = makeConfig()
): string {
  return renderAuthorizePage(
    { config },
    { requestId: REQUEST_ID, clientName: "Claude", redirectUri: REDIRECT_URI, ...params }
  );
}

describe("escapeHtml", () => {
  it("neutralizes every HTML-significant character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("jsonForScript", () => {
  it("preserves ordinary content, including spaces", () => {
    expect(jsonForScript({ apiKey: "a b c" })).toBe('{"apiKey":"a b c"}');
  });

  it("prevents a script-element breakout", () => {
    const encoded = jsonForScript({ name: "</script><script>alert(1)</script>" });
    expect(encoded).not.toContain("</script>");
    expect(encoded).not.toContain("<script>");
    expect(encoded).toContain("\\u003c");
  });

  it("escapes the JS line terminators that JSON leaves raw", () => {
    const raw = "a\u2028b\u2029c";
    expect(jsonForScript(raw)).toBe('"a\\u2028b\\u2029c"');
    expect(jsonForScript(raw)).not.toContain("\u2028");
  });

  it("round-trips through JSON.parse after escaping", () => {
    const value = { apiKey: "a b", weird: "</script> & <tag>" };
    expect(JSON.parse(jsonForScript(value))).toEqual(value);
  });
});

describe("describeRedirectTarget", () => {
  it("reduces an https URI to its origin", () => {
    expect(describeRedirectTarget("https://evil.example/cb?x=1")).toBe("https://evil.example");
  });

  it("keeps a non-default port, which is part of the identity", () => {
    expect(describeRedirectTarget("http://127.0.0.1:53682/callback")).toBe("http://127.0.0.1:53682");
  });

  it("names the scheme for a private-use native redirect", () => {
    expect(describeRedirectTarget("com.example.app:/oauth")).toBe("com.example.app");
  });

  it("returns null for an unparseable URI rather than guessing", () => {
    expect(describeRedirectTarget("not a url")).toBeNull();
    expect(describeRedirectTarget("")).toBeNull();
  });
});

describe("renderAuthorizePage", () => {
  it("escapes a malicious client_name instead of executing it", () => {
    const html = render({ clientName: XSS_NAME });

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("onerror=alert(1)>");
    expect(html).toContain("&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");

    // Exactly one script element, and it is the module we authored.
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).toContain('<script type="module">');
  });

  it("escapes a client_name that tries to break out of the h1 element", () => {
    const html = render({ clientName: `"><svg onload=alert(1)>` });
    expect(html).not.toContain("<svg");
    expect(html).toContain("&quot;&gt;&lt;svg onload=alert(1)&gt;");
  });

  it("truncates an absurdly long client_name", () => {
    const html = render({ clientName: "N".repeat(5000) });
    expect(html).not.toContain("N".repeat(121));
    expect(html).toContain("N".repeat(120));
  });

  it("falls back to a neutral label for a blank client_name", () => {
    expect(render({ clientName: "   " })).toContain("An MCP client");
  });

  it("embeds the request id and the public Firebase config only", () => {
    const html = render();
    expect(html).toContain(`const REQUEST_ID = "${REQUEST_ID}";`);
    expect(html).toContain('"apiKey":"api-key-123"');
    expect(html).toContain("firebase-app.js");
    expect(html).toContain("firebase-auth.js");
  });

  it("states that the grant is read-only and names the scope", () => {
    const html = render();
    expect(html).toContain("<strong>read-only</strong>");
    expect(html).toContain(SCOPE_READ);
    expect(html).toContain("cannot create, change or delete");
  });

  it("wires the emulator only when one is configured", () => {
    expect(render()).toContain("const EMULATOR_ORIGIN = null;");
    expect(render({}, makeConfig({ authEmulatorHost: "127.0.0.1:9099" }))).toContain(
      'const EMULATOR_ORIGIN = "http://127.0.0.1:9099";'
    );
  });

  it("posts back to the same-origin completion endpoint", () => {
    const html = render();
    expect(html).toContain('fetch("/authorize/complete"');
    expect(html).toContain('credentials: "same-origin"');
  });
});

/**
 * A DCR-registered client_name is attacker-chosen, so it cannot carry the
 * trust decision. The destination origin is the part an attacker cannot forge.
 */
describe("renderAuthorizePage: where the code actually goes", () => {
  it("shows the destination origin on the consent card", () => {
    const html = render({ redirectUri: "https://evil.example/cb" });
    expect(html).toContain("Access will be sent to");
    expect(html).toContain('<p class="destination-value">https://evil.example</p>');
  });

  it("shows the destination before the password is typed, not only after", () => {
    const html = render({ redirectUri: "https://evil.example/cb" });
    const signinIndex = html.indexOf('id="password"');
    const hintIndex = html.indexOf("This will grant read-only access to");
    expect(hintIndex).toBeGreaterThan(-1);
    expect(hintIndex).toBeLessThan(signinIndex);
  });

  it("uses the URI bound to this request, not a client's other registrations", () => {
    const html = render({ redirectUri: "https://second-uri.example/cb" });
    expect(html).toContain("https://second-uri.example");
    expect(html).not.toContain("client.example.com");
  });

  it("warns that a name proves nothing and points at the address", () => {
    const html = render({ clientName: "Claude", redirectUri: "https://evil.example/cb" });
    expect(html).toContain("Any application can register itself under any name");
    expect(html).toContain("Approve only if you recognise this address");
  });

  it("drops path-borne markup by reducing the URI to its origin", () => {
    const html = render({ redirectUri: `https://evil.example/<img src=x onerror=alert(1)>` });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain('<p class="destination-value">https://evil.example</p>');
  });

  it("escapes the characters that do survive into a host", () => {
    // & and ' are legal in a hostname and reach the rendered origin verbatim.
    const html = render({ redirectUri: `https://a&b'c.example/cb` });
    expect(html).toContain("https://a&amp;b&#39;c.example");
    expect(html).not.toContain("a&b'c.example");
  });

  it("cannot be tricked into rendering markup through the scheme", () => {
    // URL scheme grammar excludes <, >, " and spaces, so a hostile "scheme"
    // fails to parse outright and takes the unverified path.
    const html = render({ redirectUri: `a"><svg onload=alert(1)>:/cb` });
    expect(html).not.toContain("<svg");
    expect(html).toContain("an address we could not read");
  });

  it("names a legitimate private-use scheme for native clients", () => {
    const html = render({ redirectUri: "com.example.app:/oauth" });
    expect(html).toContain('<p class="destination-value">com.example.app</p>');
  });

  it("says so plainly when the destination cannot be read", () => {
    const html = render({ redirectUri: "not a url" });
    expect(html).toContain("an address we could not read");
    expect(html).toContain("Do not approve it unless you are certain");
  });

  it("escapes the client name inside the destination note", () => {
    const html = render({ clientName: XSS_NAME, redirectUri: "https://evil.example/cb" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;/script&gt;&lt;img");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("locks the page down to the Firebase SDK origin", () => {
    const csp = buildContentSecurityPolicy(makeConfig());
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self' https://www.gstatic.com 'unsafe-inline'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain(
      "connect-src https://*.googleapis.com https://identitytoolkit.googleapis.com 'self'"
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it("adds the auth emulator to connect-src when configured", () => {
    const csp = buildContentSecurityPolicy(makeConfig({ authEmulatorHost: "127.0.0.1:9099" }));
    expect(csp).toContain("http://127.0.0.1:9099");
  });

  it("does not widen script-src for the emulator", () => {
    const csp = buildContentSecurityPolicy(makeConfig({ authEmulatorHost: "127.0.0.1:9099" }));
    const scriptSrc = csp.split("; ").find((directive) => directive.startsWith("script-src"));
    expect(scriptSrc).toBe("script-src 'self' https://www.gstatic.com 'unsafe-inline'");
  });
});

describe("renderErrorPage", () => {
  it("escapes the message it is given", () => {
    const html = renderErrorPage(`<img src=x onerror=alert(1)>`);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("carries no script and no Firebase config", () => {
    const html = renderErrorPage("This authorization request has expired.");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("apiKey");
  });
});
