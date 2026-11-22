# hometube-mobile

React Native (Expo) mobile client for HomeTube. Standalone repo — does not
need the `you-tube` backend repo checked out separately.

## Getting started (fresh clone)

```bash
git clone https://github.com/masim79/you-tube-mobile.git
cd you-tube-mobile
npm install
npm run setup:vendor   # pulls only what's needed from vendor/you-tube (see below)
npm run gen:api        # generates src/api/schema.generated.ts
npm run gen:tokens      # generates src/theme/tokens.generated.ts
npm start
```

## About `vendor/you-tube`

This app is a client of HomeTube's API and shares its design tokens, so it
needs two files from the main `you-tube` repo:

- `contracts/openapi.yaml` — generates the typed API client (`gen:api`)
- `frontend/src/styles/themes/*.css` — generates the shared design tokens
  (`gen:tokens`)

`vendor/you-tube` is a git submodule pinned to `you-tube`, but `npm run
setup:vendor` configures it as a **shallow, sparse checkout**: only those
two paths are fetched and checked out — not `backend/`, `nginx/`, `docker/`,
or the rest of that repo, and only its latest commit, not its full history.

If you ever need more of `you-tube` than that (e.g. to cross-reference
backend code), widen the sparse-checkout:

```bash
git -C vendor/you-tube sparse-checkout add backend
```

To pull in a newer `you-tube` commit after a contract or token change:

```bash
git submodule update --remote vendor/you-tube
npm run gen:api
npm run gen:tokens
```
