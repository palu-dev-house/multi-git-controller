# Multi-Git Controller

Switch SSH keys and Git identity between multiple accounts with one click. Built for developers who juggle multiple GitHub, Bitbucket, GitLab, and other Git provider accounts.

## Features

- **One-click SSH key switching** — Activate any account and `~/.ssh/id_ed25519` is updated instantly
- **Auto Git identity** — `git config --global user.name` and `user.email` update on switch to prevent unverified commits
- **System tray** — Switch accounts from the menu bar without opening the app
- **Native notifications** — Get notified when the active account changes
- **Auto SSH key generation** — Keys are generated automatically when you add an account
- **Multi-provider support** — GitHub, Bitbucket, GitLab, Codeberg, Gitea, SourceHut, Azure DevOps
- **SSH connection test** — Verify your key works with each provider
- **Copy public key** — One click to copy for adding to your provider
- **Cross-platform** — macOS, Windows, Linux

## Download

Download the latest release from the [Releases](https://github.com/palu-dev-house/multi-git-controller/releases) page:

| Platform | Format |
|----------|--------|
| macOS | `.dmg`, `.zip` |
| Windows | `.exe` (installer), `.exe` (portable) |
| Linux | `.AppImage`, `.deb` |

## How It Works

1. **Add an account** — Enter your email, username, select provider, and optionally add a label
2. **SSH key is auto-generated** — An ed25519 key pair is created at `~/.ssh/git_<provider>-<username>`
3. **Copy the public key** — Add it to your Git provider (GitHub/Bitbucket/GitLab settings)
4. **Activate** — Click "Activate" or switch from the system tray. The app copies the key to `~/.ssh/id_ed25519` and updates your global Git config

## Development

```bash
cd app
npm install
npm start
```

### Build locally

```bash
cd app
npm run build:mac     # macOS — .dmg + .zip
npm run build:win     # Windows — .exe (NSIS + portable)
npm run build:linux   # Linux — .AppImage + .deb
```

## Release

Releases are automated with [semantic-release](https://github.com/semantic-release/semantic-release). Push to `main` with [conventional commits](https://www.conventionalcommits.org/) and the GitHub Action will:

1. Build for macOS, Windows, and Linux
2. Create a GitHub Release with version and changelog
3. Attach all platform binaries as download links

### Commit prefixes

| Prefix | Release |
|--------|---------|
| `feat:` | Minor (1.x.0) |
| `fix:` | Patch (1.0.x) |
| `feat!:` or `BREAKING CHANGE:` | Major (x.0.0) |

## License

MIT

---

Built by [Ferdy](https://paludevhouse.site) at [Palu Dev House](https://paludevhouse.site)
