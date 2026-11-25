# Watchtower

Local board of Jira stories where you're assigned at least one subtask, with every sibling subtask's assignee and status. Status changes since you last looked are highlighted until you mark them seen. Unanswered @mentions of you are marked with a red dot.

## Run

```
npx github:pkonstantinov-dev/watchtower
```

This installs and starts the board, then opens http://localhost:5180 in your browser. Run the same command again next time. It always starts the latest version.

To run a specific version, add its tag after `#`:

```
npx github:pkonstantinov-dev/watchtower#v1.1.0
```

All versions are listed on the [tags page](https://github.com/pkonstantinov-dev/watchtower/tags).

To use a different port, add `--port`:

```
npx github:pkonstantinov-dev/watchtower --port 3000
```

Each port is a separate site for the browser, so you sign in again the first time you use a new port.

## Requirements

Node.js 20.19+ or 22.12+, and git. Check with `node --version` and `git --version`.

macOS ([Homebrew](https://brew.sh)):

```
brew install node git
```

Windows (PowerShell):

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Linux (most distributions ship an older Node.js, so use [nvm](https://github.com/nvm-sh/nvm)):

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install --lts
sudo apt install git
```

Open a new terminal after the install, so the new commands are found. On Linux, use your distribution's package manager for git if it is not `apt`.

To work on the code, clone the repo and run `npm install` and `npm run dev`.

## Sign in

1. **Jira site**: for example `your-company.atlassian.net`.
2. **Email** and **API token**: create a token at https://id.atlassian.com/manage-profile/security/api-tokens.
3. **Space**: pick the Jira space (project) to watch. Use "Switch space" to change it later.

The site, email and token are stored in this browser's localStorage. "Sign out" removes them. The Vite dev server proxies `/rest` to your Jira site, because Jira Cloud does not allow direct browser calls. The proxy forwards only GET requests, so the board cannot change anything in Jira.

Jira Cloud only (uses REST API v3).

## Features

Each user turns optional features on or off in the **Features** drawer. The choice is stored in their browser.

Every new feature must have its own toggle:

1. Add an entry to `FEATURES` in `src/features.js` with an `id`, `name`, `description` and `default`.
2. Read `features.<id>` in the board and render nothing for the feature when it is `false`.
3. If the feature needs extra Jira requests, skip them when it is off (see `mentions` in `loadIssues`).

Use `default: false` for experimental features, so users opt in.
