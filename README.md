# Marketplace — Setup Guide

## Requirements

- Node.js 22.13 or newer and npm.
- Docker Desktop running.
- MongoDB Atlas connection string and database user. Allow your current IP in Atlas.
- Razorpay test API keys for checkout.

## 1. Install dependencies

Run these commands from the project root:

```powershell
npm ci
npm ci --prefix client
npm ci --prefix server
```

## 2. Configure the backend

Create the environment file if it does not already exist:

```powershell
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
```

Update these values in `server/.env`:

```dotenv
MONGODB_URI="your-private-atlas-connection-string"
MONGODB_DB_NAME=marketplace
JWT_SECRET="your-random-secret"
RAZORPAY_KEY_ID="your-test-key-id"
RAZORPAY_KEY_SECRET="your-test-key-secret"
RAZORPAY_PAYMENT_FLOW=standard
```

Generate a random JWT secret with this command and copy its output into `JWT_SECRET`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep the other local defaults from `.env.example`. Keep `.env` private. The React
client does not need an environment file.

## 3. Start Redis

```powershell
npm run services:up
```

If the existing Marketplace containers already use ports 6379 and 9200, start
those instead:

```powershell
docker start marketplace-redis
```

The backend defaults to `redis://127.0.0.1:6379`.

## 4. Start the application

In one terminal, from the project root:

```powershell
npm run dev:server
```

In a second terminal:

```powershell
npm run dev:client
```

Open **http://localhost:5173**. The backend runs at **http://localhost:5000**.

## 5. Set up an administrator

Register an account in the app, then run this with that account's email:

```powershell
npm --prefix server run admin:grant -- your-email@example.com
```

To create a store, use another account to apply under **My store**. Approve its
application at `/admin/vendors`, then add products through `/vendor/products`.
Create the MongoDB Atlas Search index once (using your Atlas connection in `server/.env`):

```powershell
npm --prefix server run search:setup
```

Wait until the `marketplace_products` and `marketplace_suggestions` indexes are ready in Atlas before searching by keyword.

## Optional connections

Standard Razorpay test checkout works without Route. Set `COMMISSION_BPS=1000`
for 10% commission accounting. Automatic vendor transfers require Route access,
linked accounts, and `RAZORPAY_PAYMENT_FLOW=route`.

For S3 image uploads, configure `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and
`AWS_SECRET_ACCESS_KEY` in `server/.env` when the bucket is ready. Products can
be saved without images.

For signed payment webhooks, configure `RAZORPAY_WEBHOOK_SECRET` and the public
webhook URL `/api/payments/razorpay/webhook`. Local payments can be verified
through the checkout callback without this connection.
