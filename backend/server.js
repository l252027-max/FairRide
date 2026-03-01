// =============================================
// FairRide Backend Server
// Node.js + Express + Socket.io
// =============================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fairride_secret_2024';
const COMMISSION_RATE = 0.10; // 10%

// =============================================
// IN-MEMORY DATABASE (replace with MongoDB/PostgreSQL in production)
// =============================================
const db = {
  users: [],
  rides: [],
  withdrawals: [],
  activeConnections: {} // socketId -> { userId, role }
};

// Seed demo accounts
const seedDemo = async () => {
  const passHash = await bcrypt.hash('demo123', 10);
  db.users.push(
    { id:'p1', name:'Ali Hassan', phone:'+923001234567', password:passHash, role:'passenger', createdAt:new Date() },
    { id:'d1', name:'Ahmed Khan', phone:'+923009876543', password:passHash, role:'driver', vehicle:'Toyota Corolla 2020', plate:'ABC-123', cnic:'35201-1234567-1', balance:0, totalEarned:0, todayEarned:0, todayRides:0, createdAt:new Date() }
  );
  console.log('Demo accounts seeded. Phone: +923001234567 / +923009876543, Password: demo123');
};
seedDemo();

// =============================================
// MIDDLEWARE
// =============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success:false, message:'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ success:false, message:'Invalid token' });
  }
};

// =============================================
// AUTH ROUTES
// =============================================
app.post('/auth/register', async (req, res) => {
  const { name, phone, password, role, vehicle, plate, cnic } = req.body;

  if (!name || !phone || !password || !role) return res.json({ success:false, message:'Missing required fields' });
  if (db.users.find(u => u.phone === phone)) return res.json({ success:false, message:'Phone already registered' });
  if (password.length < 6) return res.json({ success:false, message:'Password too short' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: 'u' + Date.now(),
    name, phone, role,
    password: hashedPassword,
    ...(role === 'driver' ? { vehicle, plate, cnic, balance:0, totalEarned:0, todayEarned:0, todayRides:0, approved:false } : {}),
    createdAt: new Date()
  };

  db.users.push(user);
  const token = jwt.sign({ id:user.id, role:user.role }, JWT_SECRET, { expiresIn:'7d' });
  const { password:_, ...safeUser } = user;

  res.json({ success:true, user:safeUser, token });
});

app.post('/auth/login', async (req, res) => {
  const { phone, password } = req.body;
  const user = db.users.find(u => u.phone === phone);
  if (!user) return res.json({ success:false, message:'Phone not registered' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.json({ success:false, message:'Wrong password' });

  const token = jwt.sign({ id:user.id, role:user.role }, JWT_SECRET, { expiresIn:'7d' });
  const { password:_, ...safeUser } = user;
  res.json({ success:true, user:safeUser, token });
});

// =============================================
// DRIVER ROUTES
// =============================================
app.get('/driver/stats', (req, res) => {
  const driver = db.users.find(u => u.id === req.query.id && u.role === 'driver');
  if (!driver) return res.json({ success:false, message:'Driver not found' });
  res.json({
    success:true,
    todayRides: driver.todayRides || 0,
    todayEarned: driver.todayEarned || 0,
    totalEarned: driver.totalEarned || 0,
    balance: driver.balance || 0
  });
});

app.post('/driver/withdraw', async (req, res) => {
  const { driverId, method, account, amount } = req.body;
  const driver = db.users.find(u => u.id === driverId && u.role === 'driver');
  if (!driver) return res.json({ success:false, message:'Driver not found' });
  if (amount > driver.balance) return res.json({ success:false, message:'Insufficient balance' });
  if (amount < 100) return res.json({ success:false, message:'Minimum withdrawal is PKR 100' });

  driver.balance -= amount;
  const withdrawal = {
    id: 'w' + Date.now(),
    driverId, method, account, amount,
    status: 'pending',
    requestedAt: new Date()
  };
  db.withdrawals.push(withdrawal);

  // In production: integrate JazzCash/EasyPaisa API here
  console.log(`Withdrawal request: PKR ${amount} to ${method} - ${account} for driver ${driverId}`);

  res.json({ success:true, withdrawal, newBalance: driver.balance });
});

app.get('/driver/rides', (req, res) => {
  const rides = db.rides.filter(r => r.driverId === req.query.id).slice(-20);
  res.json({ success:true, rides });
});

// =============================================
// ADMIN ROUTES (basic)
// =============================================
app.get('/admin/stats', (req, res) => {
  const totalRides = db.rides.length;
  const totalCommission = db.rides.reduce((sum, r) => sum + (r.commission || 0), 0);
  const totalUsers = db.users.length;
  const pendingWithdrawals = db.withdrawals.filter(w => w.status === 'pending').length;
  res.json({ success:true, totalRides, totalCommission, totalUsers, pendingWithdrawals });
});

// =============================================
// REAL-TIME SOCKET.IO
// =============================================
const onlineDrivers = new Map(); // driverId -> socketId
const passengerRequests = new Map(); // requestId -> request data

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('identify', ({ userId, role }) => {
    socket.userId = userId;
    socket.userRole = role;
    db.activeConnections[socket.id] = { userId, role };
    if (role === 'driver') {
      socket.join('drivers');
    }
    console.log(`${role} ${userId} identified`);
  });

  // ---- PASSENGER: Request a ride ----
  socket.on('request_ride', (rideData) => {
    passengerRequests.set(rideData.id, { ...rideData, passengerSocketId: socket.id });
    // Broadcast to all online drivers
    socket.to('drivers').emit('new_request', rideData);
    console.log(`Ride request ${rideData.id} broadcasted to drivers`);
  });

  // ---- DRIVER: Go online ----
  socket.on('driver_online', ({ driverId }) => {
    onlineDrivers.set(driverId, socket.id);
    socket.join('drivers');
    console.log(`Driver ${driverId} is online`);
  });

  // ---- DRIVER: Go offline ----
  socket.on('driver_offline', ({ driverId }) => {
    onlineDrivers.delete(driverId);
    socket.leave('drivers');
  });

  // ---- DRIVER: Accept ride ----
  socket.on('accept_ride', ({ requestId, driverId, driverInfo, fare }) => {
    const request = passengerRequests.get(requestId);
    if (!request) return;
    // Notify passenger
    io.to(request.passengerSocketId).emit('driver_accepted', { driverInfo, fare });
    // Remove from available requests
    passengerRequests.delete(requestId);
    socket.to('drivers').emit('request_cancelled', { requestId }); // tell other drivers it's taken
    console.log(`Driver ${driverId} accepted ride ${requestId}`);
  });

  // ---- DRIVER: Counter offer ----
  socket.on('counter_offer', ({ requestId, counterFare, driverInfo }) => {
    const request = passengerRequests.get(requestId);
    if (!request) return;
    io.to(request.passengerSocketId).emit('driver_countered', { counterFare, driverInfo, requestId });
  });

  // ---- PASSENGER: Accept counter ----
  socket.on('accept_counter', ({ fare, driverInfo }) => {
    // Find driver socket and notify
    const driverSocketId = onlineDrivers.get(driverInfo.id);
    if (driverSocketId) {
      io.to(driverSocketId).emit('passenger_accepted_counter', { fare });
    }
  });

  // ---- PASSENGER: Cancel ride ----
  socket.on('cancel_ride', ({ requestId }) => {
    passengerRequests.delete(requestId);
    socket.to('drivers').emit('request_cancelled', { requestId });
  });

  // ---- DRIVER: Complete ride ----
  socket.on('complete_ride', ({ rideId, fare, passengerId }) => {
    const driver = db.users.find(u => u.id === socket.userId);
    if (driver) {
      const commission = Math.round(fare * COMMISSION_RATE);
      const net = fare - commission;
      driver.balance = (driver.balance || 0) + net;
      driver.totalEarned = (driver.totalEarned || 0) + net;
      driver.todayEarned = (driver.todayEarned || 0) + net;
      driver.todayRides = (driver.todayRides || 0) + 1;

      db.rides.push({
        id: 'ride' + Date.now(),
        driverId: socket.userId,
        passengerId, fare, commission, net,
        completedAt: new Date()
      });
    }
    // Notify passenger
    if (passengerId) {
      const passengerSocket = Object.entries(db.activeConnections).find(([sid, c]) => c.userId === passengerId)?.[0];
      if (passengerSocket) io.to(passengerSocket).emit('ride_completed_passenger');
    }
  });

  socket.on('disconnect', () => {
    delete db.activeConnections[socket.id];
    // Remove from online drivers if applicable
    for (const [dId, sId] of onlineDrivers) {
      if (sId === socket.id) { onlineDrivers.delete(dId); break; }
    }
    console.log('Client disconnected:', socket.id);
  });
});

// =============================================
// CATCH-ALL: Serve frontend
// =============================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

server.listen(PORT, () => {
  console.log(`\n🚗 FairRide Server running on http://localhost:${PORT}`);
  console.log(`📱 Open in browser: http://localhost:${PORT}`);
  console.log(`💰 Commission rate: ${COMMISSION_RATE * 100}%\n`);
});
