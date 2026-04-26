# dualrecording

## Render deployment

This repository is a monorepo with two apps:

- `backend`: Node.js API server
- `frontend`: Vite/React static app

Use the included `render.yaml` as a Render Blueprint, or create the services manually.

### Backend service

Create a **Web Service**, not a Static Site.

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Environment variables:

- `MONGO_URI`
- `JWT_SECRET`
- `CLOUD_NAME`
- `API_KEY`
- `API_SECRET`
- `APP_ORIGIN`: your deployed frontend URL, for example `https://dualrecord-frontend.onrender.com`

Do not set `PORT` on Render. Render provides it automatically.

### Frontend service

Create a **Static Site**.

- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

Environment variables:

- `VITE_API_URL`: your deployed backend URL, for example `https://dualrecord-backend.onrender.com`

The frontend reads the API base URL from one place: `frontend/src/lib/api.js`.
For Vercel or Render frontend deployments, set `VITE_API_URL` to the backend URL.
If `VITE_API_URL` is not set, production builds fall back to `https://dualrecord-backend.onrender.com`.

### Common Render mistake

If you see:

```text
Publish directory node server.js does not exist
```

the backend was created as a Static Site by mistake. Delete that service and create it as a Web Service, or deploy through the `render.yaml` Blueprint.
