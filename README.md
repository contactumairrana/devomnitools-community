# DevOmniTools Community & Open-Source Core

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tools Count](https://img.shields.io/badge/Tools-79%2B%20Utilities-brightgreen)](https://www.devomnitools.com/en/tools/)
[![Zero Telemetry](https://img.shields.io/badge/Telemetry-0.00%25%20Client--Side-success)](https://www.devomnitools.com/en/about/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/contactumairrana/devomnitools-community/pulls)

[🚀 Open DevOmniTools](https://www.devomnitools.com/en/) · [🧰 Browse 79+ Tools](https://www.devomnitools.com/en/tools/) · [⚡ Tool Chains](https://www.devomnitools.com/en/workflows/) · [📖 Technical Guides](https://www.devomnitools.com/en/guides/)

DevOmniTools is a production-grade suite of **79+ privacy-first developer utilities** running 100% in browser RAM across English, German, Spanish, and Arabic. 

This public repository serves two primary purposes:
1. **Open-Source Core Engines (`packages/core-tools`):** Standalone, MIT-licensed client-side algorithms (SVG-to-Font TrueType compiler, in-browser JWKS signature verifier, lossless 64-bit BigInt diff engine, and cURL-to-Python generators).
2. **Community Issue & Feedback Hub:** Public bug reports, feature requests, and RFC discussions. *(The proprietary web deployment framework is maintained in a private repository).*

---

## 📦 Open-Source Core Packages (`/packages/core-tools`)

You can inspect, audit, or integrate our zero-telemetry client-side tool implementations directly:

| Package Module | Description | Engine / Standard |
|---|---|---|
| [`svg-to-font.ts`](packages/core-tools/svg-to-font.ts) | Parses SVG paths into Bézier curves and compiles TrueType (`.ttf`) and WOFF web fonts client-side. | TrueType Spec / IcoMoon JSON |
| [`jwt-verifier.ts`](packages/core-tools/jwt-verifier.ts) | Verifies RS256/ES256 signatures via remote JWKS endpoints using native W3C WebCrypto with zero secret leaks. | RFC 7515 / W3C WebCrypto |
| [`diff-checker.ts`](packages/core-tools/diff-checker.ts) | Computes Myers LCS diffs and semantic JSON AST comparisons inside an isolated Web Worker. | Myers LCS / JSON AST |
| [`curl-converter.ts`](packages/core-tools/curl-converter.ts) | Multi-target cURL flag parser generating Python `requests`/`httpx`, Node `axios`, Go, and Rust `reqwest` code. | POSIX cURL AST |
| [`aes-encryption.ts`](packages/core-tools/aes-encryption.ts) | AES-GCM 256-bit envelope encryption with PBKDF2 600,000 iterations and terminal CLI decryption scripts. | NIST SP 800-38D |
| [`unix-timestamp.ts`](packages/core-tools/unix-timestamp.ts) | Epoch conversions with 64-bit Discord/Twitter Snowflake ID decoding and batch CSV timestamps. | Twitter Snowflake / ISO 8601 |
| [`json-formatter.ts`](packages/core-tools/json-formatter.ts) | Lossless 64-bit integer JSON formatter that prevents integer truncation beyond `2^53 - 1`. | IEEE 754-2008 / BigInt |

---

## ⚡ Open-Source AI Agent Skills & Tooling

| Repository / Package | Description | AI Client Support |
|---|---|---|
| [**cleanroom-recon**](https://github.com/contactumairrana/cleanroom-recon) | Clean-room reverse engineering & architectural blueprint engine. Dissects web apps into TypeScript specs, Mermaid.js maps, and zero-leak security audits in 60s. | Claude Code, Cursor, Antigravity |

---

## 🛡️ Zero Server Upload & Privacy Architecture

Unlike traditional online formatters that send proprietary tokens, SQL schemas, and code to remote servers:
* **100% In-Browser Memory:** All cryptographic hashing, Base64URL parsing, and vector compiling execute strictly within your local browser tab (`window.crypto.subtle`).
* **Zero Telemetry:** Open your browser's Network tab before pasting passwords, tokens, or files. Zero payload bytes leave your device.
* **Progressive Web App (PWA):** Fully offline-capable. Once cached, use the entire suite on airplanes, VPN enclaves, or air-gapped workstations.

---

## 🌟 Top Flagship Developer Utilities

| Tool | Live Web Link | Key Features |
|---|---|---|
| **SVG to Font Compiler** | [devomnitools.com/.../svg-to-font](https://www.devomnitools.com/en/tools/svg-to-font/) | Vector icon to TTF/WOFF font with IcoMoon `selection.json` import |
| **JWT Decoder & JWKS Verifier** | [devomnitools.com/.../jwt-decoder](https://www.devomnitools.com/en/tools/jwt-decoder/) | Offline token inspection + In-browser JWKS public key verification |
| **cURL Command Converter** | [devomnitools.com/.../curl-converter](https://www.devomnitools.com/en/tools/curl-converter/) | Converts complex cURL to Python, Node.js, Go & Rust with full flag parsing |
| **Text & JSON Diff Checker** | [devomnitools.com/.../diff-checker](https://www.devomnitools.com/en/tools/diff-checker/) | Semantic JSON tree diffs, whitespace tolerance, 100% free with no paywall |
| **AES-256-GCM Encryptor** | [devomnitools.com/.../aes-encryption](https://www.devomnitools.com/en/tools/aes-encryption/) | Browser encryption + automatic OpenSSL / Python decryption code export |
| **Robots.txt RFC 9309 Tester** | [devomnitools.com/.../robots-txt-tester](https://www.devomnitools.com/en/tools/robots-txt-tester/) | Conflict visualizer with 1-click AI crawler presets (GPTBot, ClaudeBot, etc.) |

---

## 📋 Open-Source Directory Submissions & Integrations

| Directory | Submission | Status |
| --- | --- | --- |
| Brad Traversy Design Resources | [PR #1731](https://github.com/bradtraversy/design-resources-for-developers/pull/1731) | **Merged** 🎉 |
| Awesome SEO Tools | [PR #572](https://github.com/serpapi/awesome-seo-tools/pull/572) | **Submitted** 🟢 |
| Awesome Astro Showcase | [PR #164](https://github.com/one-aalam/awesome-astro/pull/164) | **Submitted** 🟢 |
| Awesome DevTools | [PR #454](https://github.com/devtoolsd/awesome-devtools/pull/454) | **Submitted** 🟢 |
| Awesome PWA | [PR #565](https://github.com/hemanth/awesome-pwa/pull/565) | **Submitted** 🟢 |
| Marko Denic Web Resources | [PR #820](https://github.com/markodenic/web-development-resources/pull/820) | **Submitted** 🟢 |

---

## 🤝 Contributing & Community

- 🐛 [Report a Bug](https://github.com/contactumairrana/devomnitools-community/issues/new?template=bug_report.md)
- 💡 [Request a New Tool](https://github.com/contactumairrana/devomnitools-community/issues/new?template=feature_request.md)
- 💬 [Discussions & RFCs](https://github.com/contactumairrana/devomnitools-community/discussions)

Repository materials and core tool libraries are licensed under [MIT](LICENSE). Maintained with ❤️ by [Muhammad Umair](https://github.com/contactumairrana) and the DevOmniTools Community.
