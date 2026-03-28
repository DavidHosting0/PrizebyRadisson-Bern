# Fix: GitHub only shows `.gitattributes`

This happens when **Git was initialized in the wrong folder**.

On your machine, the **full project** lives in:

`Housekeeping\`  
→ `apps\`, `packages\`, `package.json`, etc.

But there is also a **nested** folder `Housekeeping\PrizebyRadisson Bern\` that has its **own** `.git` and only committed `.gitattributes`. Pushes from that subfolder upload **nothing else** to GitHub.

## Fix (use the monorepo root)

1. **Close** any editor using files inside `PrizebyRadisson Bern`.

2. **Delete the nested Git repo** (keeps the folder if you need it empty — or delete the whole subfolder):

   ```powershell
   cd "C:\Users\ytmad\Desktop\Housekeeping\PrizebyRadisson Bern"
   Remove-Item -Recurse -Force .git
   ```

   Or delete the entire `PrizebyRadisson Bern` folder if you don’t need it:

   ```powershell
   cd C:\Users\ytmad\Desktop\Housekeeping
   Remove-Item -Recurse -Force "PrizebyRadisson Bern"
   ```

3. **Initialize Git at the real project root**:

   ```powershell
   cd C:\Users\ytmad\Desktop\Housekeeping
   git init
   git add .
   git status
   ```

   You should see `apps/`, `packages/`, `README.md`, etc. — **not** only `.gitattributes`.

4. **Commit and connect GitHub**:

   ```powershell
   git commit -m "Initial commit: housekeeping monorepo"
   git branch -M main
   git remote add origin https://github.com/DavidHosting0/PrizebyRadisson-Bern.git
   ```

5. **Push** (remote may already have the tiny commit — choose one):

   - **Replace** remote history with your full tree (common for a new repo):

     ```powershell
     git push -u origin main --force
     ```

   - Or **merge** instead of force (if others use the repo): ask before force-pushing.

6. Refresh **https://github.com/DavidHosting0/PrizebyRadisson-Bern** — you should see `apps`, `packages`, etc.

## Rules going forward

- Run `git status` from **`Housekeeping`** (where root `package.json` is), not from a random subfolder.
- One repo root = one `.git` folder at `Housekeeping\.git`.
