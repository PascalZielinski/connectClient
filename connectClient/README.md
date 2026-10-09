# Connect Client

Connect is a React + Vite frontend for the Connect Server REST API. It can also
run inside the included Tauri desktop shell.

## Run the client

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

In development, API requests use Vite's `/api` proxy to
`http://192.168.178.66:8080`. Set `VITE_API_URL` to the API's full base URL to
override the default, for example:

```dotenv
# .env.local
VITE_API_URL=https://api.example.test/api
```

Restart the development server after changing `.env.local`. Vite's proxy only
applies during development; configure `VITE_API_URL` for production builds.

The app stores access and refresh tokens in browser local storage, refreshes
expired access tokens through `/token/refresh`, and clears the local session
when the refresh token is rejected.

## Included flows

- Register and sign in with the API.
- Browse public servers, join them, and create a server.
- Open joined servers from the server rail or sidebar.
- View server channels and members, create text/voice channels, edit server
  settings, and leave or delete a server.
- Read text-channel message history, load older pages, and send messages.
- Create, update, and delete your own profile.
