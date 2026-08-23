# Security

Do not put credentials in `fpg.yml` or command arguments. Inject deployment secrets directly into the target runtime. FPG redacts common `Cookie`, `Authorization`, token, password, API key, and secret patterns from captured command output, but input configuration should still contain no secrets.

Maintainer: Reality_JH. Report vulnerabilities privately to `849034843@qq.com` before public disclosure. Do not include credentials, cookies, tokens, or business data in a public issue.
