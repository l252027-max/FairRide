# 🚗 FairRide — Ride-Sharing App

> Passengers set the price. Drivers compete. Platform earns 10% commission.

---

## 📁 Project Structure

```
fairride/
├── frontend/
│   ├── index.html      ← Full app UI (passenger + driver)
│   ├── style.css       ← All styles
│   └── app.js          ← Frontend logic + Socket.io client
├── backend/
│   └── server.js       ← Express + Socket.io server
├── package.json
└── README.md
```

---

## ✅ Features Built

### 👤 Auth System
- Register as Passenger or Driver
- Login with phone + password
- JWT token authentication
- Driver registration with vehicle, plate, CNIC

### 🙋 Passenger App
- Set pickup & drop-off location
- Interactive dark map (Leaflet.js)
- Propose your own fare
- Choose payment: Cash / JazzCash / EasyPaisa
- Receive driver counter-offers
- Accept or decline counter offers
- Real-time ride tracking
- Digital payment instructions panel

### 🚗 Driver App
- Toggle online/offline
- See nearby ride requests in real-time
- Accept rides directly
- Send counter offers with price slider
- Active ride management
- Earnings tracker (rides, earned, commission)
- Withdrawal system (JazzCash / EasyPaisa / Bank)

### 💰 Business Model
- **10% commission** on every completed ride
- Driver earns 90% of agreed fare
- Withdrawal requests processed within 24 hours

### 🔌 Real-time (Socket.io Events)
| Event | Direction | Description |
|-------|-----------|-------------|
| `request_ride` | Passenger → Server | New ride request |
| `new_request` | Server → Drivers | Broadcast new ride |
| `accept_ride` | Driver → Server | Accept a request |
| `driver_accepted` | Server → Passenger | Ride confirmed |
| `counter_offer` | Driver → Server | Send counter fare |
| `driver_countered` | Server → Passenger | Counter received |
| `accept_counter` | Passenger → Server | Accept counter |
| `complete_ride` | Driver → Server | Ride finished |
| `cancel_ride` | Passenger → Server | Cancel request |

---

## 🚀 How to Run Locally

### 1. Install Node.js
Download from: https://nodejs.org (version 16+)

### 2. Install dependencies
```bash
cd fairride
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
```
http://localhost:3000
```

### Demo Accounts (pre-seeded)
| Role | Phone | Password |
|------|-------|----------|
| Passenger | +923001234567 | demo123 |
| Driver | +923009876543 | demo123 |

---

## 🌐 Deploy to Production

### Option A: Railway (Easiest — Free)
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Upload this folder to GitHub first
4. Railway auto-detects Node.js and deploys
5. Get your live URL (e.g. `https://fairride.up.railway.app`)

### Option B: Render (Free tier)
1. Go to https://render.com
2. New → Web Service → Connect GitHub repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Done!

### Option C: VPS (DigitalOcean / Hostinger)
```bash
# On your VPS:
git clone your-repo
cd fairride
npm install
npm install -g pm2
pm2 start backend/server.js --name fairride
pm2 save
```

---

## 💳 Payment Integration (Production)

### JazzCash API
1. Register at: https://sandbox.jazzcash.com.pk
2. Get Merchant ID, Password, Integrity Salt
3. Add to server.js:
```js
const JAZZCASH_MERCHANT_ID = process.env.JAZZCASH_MERCHANT_ID;
const JAZZCASH_PASSWORD = process.env.JAZZCASH_PASSWORD;
// Use JazzCash REST API for mobile account transfers
```

### EasyPaisa API
1. Register at: https://easypaisa.com.pk/merchants
2. Get Store ID and Token
3. Use Telenor EasyPaisa APIs for payouts

---

## 🗃️ Database Upgrade (Production)

Replace in-memory `db` object in server.js with:

### MongoDB (recommended)
```bash
npm install mongoose
```
```js
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);
```

### PostgreSQL
```bash
npm install pg
```

---

## 📱 Convert to Mobile App

To turn this into a real mobile app:
1. Use **Capacitor**: `npm install @capacitor/core @capacitor/cli`
2. Or wrap with **React Native** (rebuild frontend in RN)
3. Or use **Flutter** for best native performance

---

## 🔐 Environment Variables

Create a `.env` file:
```
PORT=3000
JWT_SECRET=your_super_secret_key_here
MONGODB_URI=mongodb+srv://...
JAZZCASH_MERCHANT_ID=your_id
JAZZCASH_PASSWORD=your_pass
EASYPAISA_STORE_ID=your_id
```

---

## 📊 Admin Dashboard

Access basic stats at:
```
GET /admin/stats
```
Returns: total rides, commission earned, total users, pending withdrawals.

---

## 💡 Next Steps to Scale

1. **Add Google Maps** for real routing + distance-based pricing
2. **SMS OTP verification** via Jazz/Telenor API
3. **Driver rating system** (1-5 stars)
4. **Surge pricing** during peak hours
5. **Ride history** for both roles
6. **Push notifications** via Firebase FCM
7. **In-app chat** between passenger and driver

---

Built with ❤️ using Node.js, Express, Socket.io, Leaflet.js
