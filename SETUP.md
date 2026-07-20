# Publishing this repo

## 1. Put it on GitHub

    cd gh-vehicle-duty
    git init
    git add .
    git commit -m "Ghana vehicle duty calculator v1.0.0"
    git branch -M main
    git remote add origin https://github.com/PapaAdjei/gh-vehicle-duty.git
    git push -u origin main

Then edit the `repository.url` field in package.json to your real username.

## 2. Host the live app (free)

Settings -> Pages -> Source: "Deploy from a branch" -> master -> /docs folder.
Your app goes live at https://PapaAdjei.github.io/gh-vehicle-duty/
and is installable on phone and laptop from that link.

## 3. Publish to npm (optional)

    npm login
    npm publish --access public

Developers then install with: npm install gh-vehicle-duty
(If the name is taken, change "name" in package.json, e.g. @yourname/gh-vehicle-duty)

## 4. Tell people

Add topics on GitHub: ghana, customs, import-duty, tax-calculator, gra.
