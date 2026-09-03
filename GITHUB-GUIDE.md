# GitHub Guide for Byte Brigade Members

A complete beginner's guide to using GitHub for the ScamShield project.
Read this once before your first contribution. If anything confuses you, ask in the group chat — never guess.

---

## 1. What are Git and GitHub?

- **Git** = a program on your computer that tracks every change you make to files, so nothing is ever lost and everyone's work can be combined safely.
- **GitHub** = a website (`github.com`) that stores copies of the project online, so all five of us work on the same copy and can see each other's changes.

Our repository ("repo") lives at:
**https://github.com/Bytebrigade-devs/scamshield**

---

## 2. One-time setup (do this before writing any code)

1. **Create a GitHub account** at https://github.com/signup using your real name (your commit history is graded evidence of your individual contribution).
2. **Install Git**: download from https://git-scm.com/downloads and run the installer with default options.
3. **Tell Git who you are** — open Command Prompt / PowerShell and run these two commands with *your* details:

   ```
   git config --global user.name "Your Name"
   git config --global user.email "the-email-you-used-for-github@example.com"
   ```

4. **Get your own copy of the project** ("clone"). Pick a folder you'll keep long-term, then:

   ```
   cd path\to\your\projects\folder
   git clone https://github.com/Bytebrigade-devs/scamshield.git
   cd scamshield
   ```

5. **Authenticate once**: when you first push, Git will open a browser window asking you to log in to GitHub. Approve it. Done — no passwords needed after that.

⚠️ **Always work from your OWN account and YOUR cloned copy.** Never share logins.

---

## 3. The daily workflow (every time you write code)

The golden rule: **you never edit `main` directly.** You make your own branch, open a Pull Request, and **@Svishwa2004 reviews it and merges it.** You do not need a teammate's approval, and you will not be able to merge it yourself — the button is deliberately disabled for everyone else

```
main ──► feat/m3-vault-crud (your branch) ──► Pull Request ──► @Svishwa2004 reviews & merges ──► main
```

### Step-by-step

```bash
# 1. Get the latest version of everything
git checkout main
git pull

# 2. Create a branch for your task (see naming rules below)
git checkout -b feat/m3-vault-login-form

# 3. ... do your coding ...

# 4. Save your work in small steps ("commits")
git add .
git commit -m "Add login form UI"

# 5. Upload your branch to GitHub (first time: -u sets up tracking)
git push -u origin feat/m3-vault-login-form

# 6. Open a Pull Request on github.com:
#    Go to the repo page → click "Compare & pull request"
#    Write a clear title + short description of WHAT you did and WHY

# 7. Tell @Svishwa2004 in the group chat that the PR is ready.
#    An automated Copilot review runs on every PR — read its comments and
#    push fixes to the same branch if it spots something real.

# 8. @Svishwa2004 reviews and merges. Nothing more for you to do.
#    Don't look for a merge button — you won't have one.
```

### After each coding session

Even mid-task, `push` often. Your pushed commits are safe on GitHub and count as progress evidence.

### Before starting new work again

Always repeat step 1 (`checkout main` + `pull`) so you start from the newest code.

---

## 4. Naming rules on GitHub

GitHub enforces some name rules itself, and our team adds its own conventions on top. Follow both.

### 4.1 Branch names

**GitHub's technical rules:**

- ❌ No spaces — use `-` or `_` instead
- ❌ These characters are forbidden: `space ~ ^ : ? * [ \ ..`
- ❌ Cannot start or end with `/`, cannot end with `.lock`, cannot end with `.`
- ✅ Letters, digits, `-`, `_`, `/` are fine
- Case matters: `Feat/Login` and `feat/login` are two different branches — always use **lowercase**

**Team convention (follow this pattern):**

```
<type>/<module-number>-<short-description>
```

| Type | Use for | Example |
|------|---------|---------|
| `feat/` | New features | `feat/m3-vault-crud` |
| `fix/` | Bug fixes | `fix/m2-paywall-redirect-loop` |
| `docs/` | Documentation only | `docs/setup-guide` |
| `chore/` | Config, cleanup, deps | `chore/tailwind-setup` |

Keep descriptions short (2–4 words), lowercase, hyphen-separated.

### 4.2 Repository name

- Allowed characters: letters, digits, `.`, `-`, `_` — no spaces, no other symbols
- Ours is already named `scamshield`. **Do not rename it** unless the whole team agrees — renaming breaks everyone's local clone links (see §6).

### 4.3 Files and folders in the project

- Never use spaces in file/folder names — use `kebab-case` (e.g. `password-generator.tsx`)
- Avoid special characters (`! @ # $ % ( ) & , ; ' "` etc.)
- Be careful with letter CASE: GitHub servers treat `Login.tsx` and `login.tsx` as different files even when Windows does not. Two teammates can create "the same" filename with different cases and cause confusing conflicts. Always match the existing casing exactly.

### 4.4 Commit messages

Format: `<verb> <what>` in present tense, under ~50 characters.

✅ Good: `Add password strength meter`, `Fix vault unlock timeout`, `Update schema doc`
❌ Bad: `stuff`, `final final version`, `asdfgh`

One logical change per commit. Commit small, commit often.

### 4.5 Pull Request titles

Same style as commits but may be slightly longer: `Add password generator to vault module`.

---

## 5. How to rename things on GitHub (when you actually need to)

You rarely need to rename anything, but here is how, safely:

### Rename a branch you created

On GitHub website: open your PR (or the branch page) → click the branch name dropdown → there is a rename option. Locally:

```bash
git branch -m old-name new-name        # rename locally
git push origin -u new-name            # push renamed branch
git push origin --delete old-name      # remove old one from GitHub
```

Renaming is easy **before** others have based work on it. If someone else has the old branch checked out, they need to run `git fetch && git branch -u origin/new-name` afterwards — tell them in the chat.

### Rename a file or folder

Rename it locally, then commit and push like any change (`git add .` picks up renames). On the GitHub website you can also press the `.` key inside the repo to open a browser editor and rename via right-click.

### Rename the repository

Settings → General → Repository name. **Only do this as a coordinated team decision** — old clone URLs stop working until everyone re-clones or updates their remote URL.

---

## 6. House rules for THIS repo (non-negotiable)

These come from the project brief and the protection settings already applied to `main`:

1. **`main` is protected.** Direct pushes are rejected by GitHub — for everyone, including the team lead. Everything goes through a branch + Pull Request.
2. **@Svishwa2004 reviews and merges every PR.** No teammate approval is required, and only @Svishwa2004 can complete a merge to `main`. You are still welcome to read and comment on each other's PRs — it is good practice and it helps at code review — but nothing is blocked waiting on you.
3. **Force pushes (`--force`) and deleting `main` are blocked** for everyone. If a push is rejected, never try to force it — see §7.
4. **Commit from your own account only.** Your commit history is your individual-contribution evidence at code review and viva.
5. **Shared database schema changes:** update the schema doc and mention affected module owners in your PR description.
6. All payments stay **mocked** — never integrate real payment data or keys.
7. **Never commit secrets** (API keys, `.env` files, passwords). The OpenAI key stays server-side only. If you accidentally commit a secret, tell the team lead immediately.

---

## 7. When something goes wrong

| Problem | What happened | Fix |
|---------|---------------|-----|
| `push` rejected: "fetch first" | Someone pushed newer code than you have | `git pull`, resolve if asked, then `git push` again |
| Push rejected on `main` directly | Protection rule working correctly | Make a branch and use a PR (§3) |
| Merge button greyed out on your PR | Working as intended — only @Svishwa2004 can merge to `main` | Nothing to fix. Tell @Svishwa2004 the PR is ready |
| "Merge conflict" during pull/merge | You and someone else edited the same lines | Git marks conflict spots in the file with `<<<<<<<` / `=======` / `>>>>>>>` — edit the file to keep the correct code, delete the markers, then `git add .` and `git commit` |
| Committed to the wrong branch | Happens to everyone | Don't panic, don't force-push — post in the group chat and we'll fix it together |
| Accidentally committed a secret | Urgent | Tell team lead immediately, do not push again |

**Universal safety net:** before trying anything risky, run `git status`. And remember — as long as you've committed, almost nothing is permanently lost.

---

## 8. Quick reference card

```bash
git checkout main          # switch to main
git pull                   # get latest changes
git checkout -b feat/mX-…  # new branch for my task
git status                 # what changed?
git add .                  # stage my changes
git commit -m "message"    # save snapshot locally
git push -u origin BRANCH  # upload branch to GitHub
git pull                   # sync before continuing later
```

Then on github.com: **Pull Request → tell @Svishwa2004 → they review and merge.**

*Questions? Ask in the group chat before guessing. Nobody was born knowing Git.* 🙂
