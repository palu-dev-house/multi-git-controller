# Multi-Git Controller

Switch SSH keys between your Git accounts with one click.

Manage multiple GitHub and Bitbucket accounts on the same machine without manually editing `~/.ssh` files.

## How It Works

1. **Add your accounts** — register each Git account (GitHub, Bitbucket, GitLab)
2. **Generate SSH keys** — the app creates a unique ed25519 key pair per account
3. **Copy the public key** — add it to your Git provider's SSH settings
4. **Switch with one click** — select an account and the app activates its SSH key

When you switch accounts, the app copies the selected key to `~/.ssh/id_ed25519`, so all Git operations use the correct identity.

## Download

Go to the [Releases](https://github.com/palu-dev-house/multi-git-controller/releases) page and download the latest version for your platform:

| Platform | File |
|----------|------|
| macOS    | `.dmg` or `.zip` |
| Windows  | `.exe` (installer) or portable `.exe` |
| Linux    | `.AppImage` or `.deb` |

## Development

```bash
cd app
npm install
npm start
```

### Build locally

```bash
npm run build:mac     # macOS — .dmg + .zip
npm run build:win     # Windows — .exe (NSIS + portable)
npm run build:linux   # Linux — .AppImage + .deb
```

## Release

Push a version tag to trigger the build workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The GitHub Action builds for all platforms and creates a release with download links.

## License

MIT
