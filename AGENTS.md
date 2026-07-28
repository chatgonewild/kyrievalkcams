# Kyrie Valk Cams deployment

The public production site is:

https://chatgonewild.github.io/kyrievalkcams/

GitHub is the source of truth. For user-facing changes:

1. Update the source files.
2. Run `pnpm build:pages` to validate the static build.
3. Commit the source to `main`.

GitHub Actions rebuilds and publishes the live site automatically after each commit to `main`.

The live admin portal writes uploaded images to `public/uploads/` and its image manifest to
`data/images.json`. Keep these paths and the GitHub-backed admin flow compatible.

Do not deploy a replacement ChatGPT Sites version unless the user explicitly asks for one.
