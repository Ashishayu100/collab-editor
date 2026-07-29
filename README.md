# CollabEdit — Real-Time Collaborative Document Editor

A mini Google Docs built with CRDTs (Yjs). Day 1: project scaffolding, auth, and database schema.

## Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React 18, TypeScript, Vite
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT (access + refresh tokens)
- **State**: Zustand
- **Styling**: Tailwind CSS

## Getting started

1. Start PostgreSQL:

   ```bash
   docker-compose up -d
   ```

2. Configure environment variables:

   ```bash
   cp .env.example server/.env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run database migrations:

   ```bash
   npm run prisma:migrate
   ```

5. Start the app (client + server):

   ```bash
   npm run dev
   ```

   - Client: http://localhost:5173
   - Server: http://localhost:3001

## Project structure

```
collab-editor/
├── server/     Express API (auth, documents)
├── client/     React app (Vite)
└── shared/     Types shared between client and server
```
