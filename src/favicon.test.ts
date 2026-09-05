import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import faviconIco from "../public/favicon.ico?url";
import faviconLight from "../public/favicon-light.png?url";
import faviconDark from "../public/favicon-dark.png?url";
import appleTouchIcon from "../public/apple-touch-icon.png?url";
import icon192 from "../public/icon-192.png?url";
import icon512 from "../public/icon-512.png?url";
import iconMaskable512 from "../public/icon-maskable-512.png?url";
import manifestSource from "../public/manifest.webmanifest?raw";

describe("brand icons", () => {
  it("uses the new app icon for every browser icon variant", () => {
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/favicon-light.png" media="(prefers-color-scheme: light)"');
    expect(html).toContain('href="/favicon-dark.png" media="(prefers-color-scheme: dark)"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).not.toContain('rel="icon" type="image/png" href="/brandmark.png"');

    expect(faviconIco).toContain("favicon.ico");
    expect(faviconLight).toContain("favicon-light.png");
    expect(faviconDark).toContain("favicon-dark.png");
    expect(appleTouchIcon).toContain("apple-touch-icon.png");
  });

  it("keeps every installable icon declared in the manifest", () => {
    const manifest = JSON.parse(manifestSource) as {
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    expect(manifest.icons).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    expect(icon192).toContain("icon-192.png");
    expect(icon512).toContain("icon-512.png");
    expect(iconMaskable512).toContain("icon-maskable-512.png");
  });
});
