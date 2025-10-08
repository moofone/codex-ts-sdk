# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.7   | :white_check_mark: |
| < 0.0.7 | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing:

**security@flo.ai**

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

## Security Best Practices

When using this SDK:

1. **API Keys**: Never commit API keys or credentials to version control
   - Use environment variables (`OPENAI_API_KEY`, etc.)
   - Add `.env` files to `.gitignore`
   - Rotate keys regularly

2. **Sandbox Policy**: Always configure appropriate sandbox restrictions
   ```typescript
   .withSandboxPolicy({
     mode: 'workspace-write',
     network_access: false,
     writable_roots: ['/path/to/project']
   })
   ```

3. **Input Validation**: Sanitize user input before sending to the API
   - Validate file paths before applying patches
   - Review generated diffs before applying

4. **Dependency Security**: Keep dependencies up to date
   ```bash
   npm audit
   npm update
   ```

5. **Native Bindings**: Only use official codex-rs releases
   - Verify checksums when possible
   - Use tagged releases, not `main` branch

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine affected versions
2. Audit code to find similar problems
3. Prepare fixes for all supported versions
4. Release new versions as soon as possible

## Comments on this Policy

If you have suggestions on how this process could be improved, please submit a pull request or email security@flo.ai.
