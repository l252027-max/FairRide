// =============================================
// FairRide — Frontend App Logic
// Connects to backend via Socket.io + REST API
// =============================================

const API = window.location.origin;
let socket = null;
let currentUser = null;
let maps = {};
let markers = {};
let state = {
  passenger: { pickup:'', dropoff:'', fare:0, rideStatus:'idle', driverInfo:null, counterOffer:0 },
  driver: { online:false, activeRide:null, todayRides:0, todayEarned:0, todayCommission:0, balance:0 },
  requests: [],
  currentCounterTarget: null
};

// =============================================
// INIT
// =============================================
window.addEventListener('load', () => {
  const saved = localStorage.getItem('fr_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    initSocket();
    routeByRole();
  }
});

function initSocket() {
  socket = io(API);
  socket.on('connect', () => {
    if (currentUser) socket.emit('identify', { userId: currentUser.id, role: currentUser.role });
  });

  // Passenger events
  socket.on('driver_accepted', data => {
    rideAccepted(data.driverInfo, data.fare);
  });
  socket.on('driver_countered', data => {
    state.passenger.counterOffer = data.counterFare;
    state.passenger.driverInfo = data.driverInfo;
    document.getElementById('p-counter-amount').textContent = 'PKR ' + data.counterFare;
    document.getElementById('p-counter-driver-name').textContent = 'From: ' + data.driverInfo.name;
    document.getElementById('p-counter-received').style.display = '';
    document.getElementById('p-status-bar').className = 'status-bar status-counter';
    document.getElementById('p-status-text').textContent = 'Counter offer from ' + data.driverInfo.name;
    showNotif('💬', 'Counter Offer!', data.driverInfo.name + ' offered PKR ' + data.counterFare);
  });
  socket.on('ride_completed_passenger', () => {
    showNotif('🏁', 'Ride Complete!', 'Hope you enjoyed your ride!');
    passengerStep1();
  });

  // Driver events
  socket.on('new_request', data => {
    state.requests.push(data);
    renderRequests();
    showNotif('🔔', 'New Ride Request!', data.passenger + ' - PKR ' + data.fare);
  });
  socket.on('request_cancelled', data => {
    state.requests = state.requests.filter(r => r.id !== data.requestId);
    renderRequests();
  });
  socket.on('passenger_accepted_counter', data => {
    showNotif('✅', 'Counter Accepted!', 'Passenger accepted PKR ' + data.fare);
    if (state.driver.activeRide && state.driver.activeRide.id === data.requestId) {
      state.driver.activeRide.fare = data.fare;
      document.getElementById('d-fare').textContent = 'PKR ' + data.fare;
      const net = Math.round(data.fare * 0.9);
      document.getElementById('d-net').textContent = 'PKR ' + net;
    }
  });
}

// =============================================
// SCREENS
// =============================================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  if (name === 'passenger' && !maps.passenger) setTimeout(() => initMap('passenger', [31.5204, 74.3587]), 100);
  if (name === 'driver' && !maps.driver) setTimeout(() => initMap('driver', [31.5204, 74.3587]), 100);
}

function routeByRole() {
  if (!currentUser) { showScreen('auth'); return; }
  document.getElementById('p-user-name').textContent = currentUser.name;
  document.getElementById('d-user-name').textContent = currentUser.name;
  showScreen(currentUser.role);
  if (currentUser.role === 'passenger') passengerStep1();
  if (currentUser.role === 'driver') loadDriverStats();
}

// =============================================
// AUTH
// =============================================
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
  document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById('tab-' + tab).style.display = 'flex';
  document.getElementById('tab-' + tab).style.flexDirection = 'column';
}

function selectRole(btn, role) {
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('driver-reg-extras').style.display = role === 'driver' ? '' : 'none';
}

async function login() {
  const phone = '+92' + document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-password').value;
  if (!phone || !password) { showNotif('⚠️', 'Missing Fields', 'Please enter phone and password.'); return; }

  try {
    const res = await fetch(API + '/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('fr_user', JSON.stringify(currentUser));
      initSocket();
      routeByRole();
      showNotif('👋', 'Welcome back!', currentUser.name);
    } else {
      showNotif('❌', 'Login Failed', data.message || 'Invalid credentials');
    }
  } catch(e) {
    // Demo fallback when no backend
    demoLogin(phone, password);
  }
}

function demoLogin(phone, password) {
  const demoUsers = {
    '+923001234567': { id:'p1', name:'Ali Hassan', role:'passenger', phone:'+923001234567' },
    '+923009876543': { id:'d1', name:'Ahmed Khan', role:'driver', phone:'+923009876543', vehicle:'Toyota Corolla 2020', plate:'ABC-123' }
  };
  const user = demoUsers[phone] || { id:'u'+Date.now(), name:'Demo User', role:'passenger', phone };
  currentUser = user;
  localStorage.setItem('fr_user', JSON.stringify(currentUser));
  routeByRole();
  showNotif('👋', 'Demo Login', 'Running in demo mode (no backend)');
}

async function register() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = '+92' + document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.querySelector('.role-btn.active')?.dataset.role || 'passenger';
  const vehicle = document.getElementById('reg-vehicle')?.value.trim();
  const plate = document.getElementById('reg-plate')?.value.trim();
  const cnic = document.getElementById('reg-cnic')?.value.trim();

  if (!name || !phone || !password) { showNotif('⚠️', 'Missing Fields', 'Please fill all required fields.'); return; }
  if (password.length < 6) { showNotif('⚠️', 'Weak Password', 'Password must be at least 6 characters.'); return; }
  if (role === 'driver' && (!vehicle || !plate)) { showNotif('⚠️', 'Driver Info Required', 'Please enter vehicle and plate info.'); return; }

  try {
    const res = await fetch(API + '/auth/register', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, phone, password, role, vehicle, plate, cnic })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      localStorage.setItem('fr_user', JSON.stringify(currentUser));
      initSocket();
      routeByRole();
      showNotif('🎉', 'Account Created!', 'Welcome to FairRide, ' + name + '!');
    } else {
      showNotif('❌', 'Registration Failed', data.message || 'Try again');
    }
  } catch(e) {
    // Demo fallback
    currentUser = { id:'u'+Date.now(), name, phone, role, vehicle, plate };
    localStorage.setItem('fr_user', JSON.stringify(currentUser));
    routeByRole();
    showNotif('🎉', 'Account Created (Demo)!', 'Welcome to FairRide, ' + name + '!');
  }
}

function logout() {
  if (socket) socket.disconnect();
  localStorage.removeItem('fr_user');
  currentUser = null;
  maps = {}; markers = {};
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  showScreen('auth');
}

// =============================================
// MAP
// =============================================
function initMap(role, center) {
  const map = L.map('map-' + role, { zoomControl:true, attributionControl:false }).setView(center, 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom:19 }).addTo(map);

  const youColor = role === 'passenger' ? '#f0c040' : '#2dff9a';
  const youIcon = L.divIcon({ html:`<div style="background:${youColor};width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px ${youColor}66"></div>`, className:'', iconSize:[14,14], iconAnchor:[7,7] });
  const you = L.marker(center, { icon:youIcon }).addTo(map).bindPopup(role === 'passenger' ? 'You' : 'Your Location');
  markers[role] = { you, drivers:[] };

  [[31.5150,74.3450],[31.5280,74.3700],[31.5100,74.3600],[31.5320,74.3500]].forEach(pos => {
    const d = L.divIcon({ html:`<div style="font-size:18px;line-height:1">🚗</div>`, className:'', iconSize:[22,22], iconAnchor:[11,11] });
    markers[role].drivers.push(L.marker(pos, { icon:d }).addTo(map));
  });

  maps[role] = map;
  setInterval(() => {
    markers[role]?.drivers.forEach(m => {
      const p = m.getLatLng();
      m.setLatLng([p.lat + (Math.random()-0.5)*0.002, p.lng + (Math.random()-0.5)*0.002]);
    });
  }, 2000);
}

// =============================================
// PASSENGER FLOW
// =============================================
function passengerStep1() {
  ['pstep-1','pstep-2','pstep-3'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('pstep-1').style.display = '';
  updateSteps(1);
  document.getElementById('passenger-panel-title').textContent = 'Where are you going?';
}

function passengerStep2() {
  const dest = document.getElementById('dropoff-input').value.trim();
  if (!dest) { showNotif('⚠️','Missing Destination','Please enter where you want to go.'); return; }
  state.passenger.dropoff = dest;
  state.passenger.pickup = document.getElementById('pickup-input').value.trim() || 'Current Location';
  ['pstep-1','pstep-2','pstep-3'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('pstep-2').style.display = '';
  updateSteps(2);
  document.getElementById('passenger-panel-title').textContent = 'Set Your Fare';
  if (maps.passenger) {
    const destPos = [31.508 + Math.random()*0.02, 74.34 + Math.random()*0.04];
    if (markers.passenger?.dest) maps.passenger.removeLayer(markers.passenger.dest);
    const ic = L.divIcon({ html:`<div style="background:#ff4757;width:12px;height:12px;border-radius:50%;border:3px solid white"></div>`, className:'', iconSize:[12,12], iconAnchor:[6,6] });
    markers.passenger.dest = L.marker(destPos, { icon:ic }).addTo(maps.passenger).bindPopup(dest).openPopup();
  }
}

function selectFare(el, amount) {
  document.querySelectorAll('.fare-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('fare-input').value = amount;
}

async function passengerStep3() {
  const fare = parseInt(document.getElementById('fare-input').value);
  if (!fare || fare < 50) { showNotif('⚠️','Invalid Fare','Enter a fare of at least PKR 50.'); return; }
  state.passenger.fare = fare;
  state.passenger.rideStatus = 'waiting';
  const paymentMethod = document.getElementById('payment-method').value;

  ['pstep-1','pstep-2','pstep-3'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('pstep-3').style.display = '';
  document.getElementById('p-counter-received').style.display = 'none';
  document.getElementById('p-ride-info').style.display = 'none';
  document.getElementById('p-status-bar').className = 'status-bar status-waiting';
  document.getElementById('p-status-text').textContent = 'Looking for nearby drivers...';
  document.getElementById('p-cancel-btn').style.display = '';
  updateSteps(3);
  document.getElementById('passenger-panel-title').textContent = 'Finding Your Ride';

  const rideRequest = {
    id: 'r' + Date.now(),
    passengerId: currentUser?.id,
    passenger: currentUser?.name || 'Passenger',
    pickup: state.passenger.pickup,
    dropoff: state.passenger.dropoff,
    fare, paymentMethod
  };

  if (socket?.connected) {
    socket.emit('request_ride', rideRequest);
  } else {
    // Demo: add to requests list and simulate driver response
    state.requests = [rideRequest];
    setTimeout(() => simulateDriverResponse(rideRequest), 4000);
  }
}

function simulateDriverResponse(req) {
  if (state.passenger.rideStatus !== 'waiting') return;
  const drivers = ['Ahmed K.','Bilal R.','Faisal M.','Usman T.'];
  const vehicles = ['Toyota Corolla • ABC-123','Honda Civic • XYZ-789','Suzuki Cultus • LMN-456'];
  const driverName = drivers[Math.floor(Math.random()*drivers.length)];
  const vehicle = vehicles[Math.floor(Math.random()*vehicles.length)];
  if (Math.random() > 0.45) {
    const counter = req.fare + Math.floor(Math.random()*80+30);
    state.passenger.counterOffer = counter;
    state.passenger.rideStatus = 'counter';
    state.passenger.driverInfo = { name:driverName, vehicle };
    document.getElementById('p-counter-amount').textContent = 'PKR ' + counter;
    document.getElementById('p-counter-driver-name').textContent = 'From: ' + driverName;
    document.getElementById('p-counter-received').style.display = '';
    document.getElementById('p-status-bar').className = 'status-bar status-counter';
    document.getElementById('p-status-text').textContent = 'Counter offer received';
    showNotif('💬','Counter Offer!', driverName + ' offered PKR ' + counter);
  } else {
    rideAccepted({ name:driverName, vehicle }, req.fare);
  }
}

function acceptCounter() {
  const fare = state.passenger.counterOffer;
  if (socket?.connected) {
    socket.emit('accept_counter', { fare, driverInfo: state.passenger.driverInfo });
  }
  rideAccepted(state.passenger.driverInfo, fare);
}

function declineCounter() {
  state.passenger.rideStatus = 'waiting';
  document.getElementById('p-counter-received').style.display = 'none';
  document.getElementById('p-status-bar').className = 'status-bar status-waiting';
  document.getElementById('p-status-text').textContent = 'Looking for another driver...';
  showNotif('🔍','Searching...','Looking for another driver at PKR ' + state.passenger.fare);
  setTimeout(() => {
    if (state.passenger.rideStatus === 'waiting') simulateDriverResponse({ fare: state.passenger.fare });
  }, 5000);
}

function rideAccepted(driverInfo, fare) {
  state.passenger.rideStatus = 'active';
  const eta = Math.floor(Math.random()*8+3);
  const payMethod = document.getElementById('payment-method')?.value || 'cash';

  document.getElementById('p-counter-received').style.display = 'none';
  document.getElementById('p-ride-info').style.display = '';
  document.getElementById('p-status-bar').className = 'status-bar status-active';
  document.getElementById('p-status-text').textContent = 'Driver is on the way!';
  document.getElementById('p-driver-name').textContent = driverInfo.name;
  document.getElementById('p-vehicle').textContent = driverInfo.vehicle;
  document.getElementById('p-agreed-fare').textContent = 'PKR ' + fare;
  document.getElementById('p-payment').textContent = payMethod === 'cash' ? '💵 Cash' : '📱 ' + (payMethod === 'jazzcash' ? 'JazzCash' : 'EasyPaisa');
  document.getElementById('p-eta').textContent = eta + ' mins away';
  document.getElementById('p-cancel-btn').style.display = 'none';

  if (payMethod !== 'cash') {
    document.getElementById('p-jazzcash-panel').style.display = '';
    document.getElementById('p-pay-amount').textContent = 'PKR ' + fare;
    document.querySelector('.payment-logo').textContent = payMethod === 'jazzcash' ? '📱 JazzCash' : '📱 EasyPaisa';
  }
  showNotif('✅','Ride Confirmed!', driverInfo.name + ' accepted. Arriving in ' + eta + ' mins.');
}

function confirmPayment() {
  showNotif('💸','Payment Sent!','Your digital payment has been sent to the driver.');
  document.getElementById('p-jazzcash-panel').style.display = 'none';
}

function cancelRide() {
  state.passenger.rideStatus = 'idle';
  if (socket?.connected) socket.emit('cancel_ride', { requestId: 'current' });
  passengerStep1();
  showNotif('❌','Ride Cancelled','Your ride request was cancelled.');
}

function updateSteps(active) {
  for (let i=1;i<=3;i++) {
    const el = document.getElementById('ps'+i);
    if (el) el.className = 'step' + (i === active ? ' active' : '');
  }
}

// =============================================
// DRIVER FLOW
// =============================================
function toggleDriverOnline(el) {
  state.driver.online = el.checked;
  document.getElementById('driver-status-label').innerHTML = state.driver.online
    ? '<span class="online">🟢 Online — Receiving requests</span>'
    : '<span class="offline">⚫ Offline</span>';
  document.getElementById('driver-online-panel').style.display = state.driver.online ? '' : 'none';
  document.getElementById('driver-offline-msg').style.display = state.driver.online ? 'none' : '';

  if (state.driver.online) {
    if (socket?.connected) socket.emit('driver_online', { driverId: currentUser?.id });
    state.requests = state.requests.length ? state.requests : generateDemoRequests();
    renderRequests();
    showNotif('🟢',"You're Online",'Waiting for ride requests...');
  } else {
    if (socket?.connected) socket.emit('driver_offline', { driverId: currentUser?.id });
  }
}

function generateDemoRequests() {
  return [
    { id:'demo0', passenger:'Sara A.', pickup:'Gulberg III', dropoff:'DHA Phase 5', fare:280, paymentMethod:'cash' },
    { id:'demo1', passenger:'Omar S.', pickup:'Mall Road', dropoff:'Model Town', fare:200, paymentMethod:'jazzcash' },
    { id:'demo2', passenger:'Zara H.', pickup:'Johar Town', dropoff:'Liberty Market', fare:320, paymentMethod:'cash' }
  ];
}

function renderRequests() {
  const list = document.getElementById('requests-list');
  const noReq = document.getElementById('no-requests');
  if (!list || state.driver.activeRide) return;
  document.getElementById('active-ride-panel').style.display = 'none';
  list.style.display = '';

  if (!state.requests.length) { list.innerHTML=''; noReq.style.display=''; return; }
  noReq.style.display = 'none';
  list.innerHTML = state.requests.map(r => `
    <div class="request-card" id="req-${r.id}">
      <div class="request-header">
        <div class="request-passenger"><div class="avatar">${r.passenger.charAt(0)}</div>${r.passenger}</div>
        <div class="proposed-fare">PKR ${r.fare}</div>
      </div>
      <div class="request-route">
        <div><span class="route-dot dot-green"></span>${r.pickup}</div>
        <div><span class="route-dot dot-red"></span>${r.dropoff}</div>
        <div style="margin-top:3px;font-size:11px;">${r.paymentMethod === 'cash' ? '💵 Cash' : '📱 Digital'}</div>
      </div>
      <div class="request-actions">
        <button class="btn-accept" onclick="acceptRequest('${r.id}')">✓ Accept</button>
        <button class="btn-counter" onclick="openCounterModal('${r.id}')">💬 Counter</button>
        <button class="btn-decline" onclick="declineRequest('${r.id}')">✗ Pass</button>
      </div>
    </div>
  `).join('');
}

function acceptRequest(id) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  if (socket?.connected) socket.emit('accept_ride', { requestId:id, driverId:currentUser?.id, driverInfo:{ name:currentUser?.name, vehicle:`${currentUser?.vehicle} • ${currentUser?.plate}` }, fare:req.fare });
  startActiveRide(req, req.fare);
}

function openCounterModal(id) {
  state.currentCounterTarget = id;
  const req = state.requests.find(r => r.id === id);
  if (!req) return;
  const suggested = Math.round(req.fare * 1.15);
  document.getElementById('counter-modal-sub').textContent = 'Passenger offered PKR ' + req.fare;
  document.getElementById('counter-slider').min = req.fare;
  document.getElementById('counter-slider').max = req.fare * 2;
  document.getElementById('counter-slider').value = suggested;
  updateCounter(suggested);
  document.getElementById('counter-modal').classList.add('open');
}
function closeCounterModal() { document.getElementById('counter-modal').classList.remove('open'); }

function updateCounter(val) { document.getElementById('counter-display').textContent = 'PKR ' + val; }

function sendCounter() {
  const amount = parseInt(document.getElementById('counter-slider').value);
  const id = state.currentCounterTarget;
  const req = state.requests.find(r => r.id === id);
  closeCounterModal();
  showNotif('💬','Counter Sent!','You offered PKR ' + amount);
  if (socket?.connected && req) {
    socket.emit('counter_offer', { requestId:id, counterFare:amount, driverInfo:{ name:currentUser?.name, vehicle:`${currentUser?.vehicle} • ${currentUser?.plate}` } });
  }
  // Demo: simulate passenger response
  setTimeout(() => {
    if (Math.random() > 0.35) {
      showNotif('✅','Counter Accepted!','Passenger accepted PKR ' + amount);
      if (req) startActiveRide(req, amount);
    } else {
      showNotif('❌','Counter Declined','Passenger declined. Moving on...');
      if (req) declineRequest(id);
    }
  }, 3000);
}

function declineRequest(id) {
  state.requests = state.requests.filter(r => r.id !== id);
  const card = document.getElementById('req-' + id);
  if (card) { card.style.opacity='0'; card.style.transition='opacity 0.3s'; setTimeout(() => renderRequests(), 300); }
  else renderRequests();
}

function startActiveRide(req, fare) {
  state.driver.activeRide = { ...req, fare };
  state.requests = [];
  document.getElementById('requests-list').style.display = 'none';
  document.getElementById('no-requests').style.display = 'none';
  document.getElementById('active-ride-panel').style.display = '';
  document.getElementById('d-passenger-name').textContent = req.passenger;
  document.getElementById('d-from').textContent = req.pickup;
  document.getElementById('d-to').textContent = req.dropoff;
  document.getElementById('d-fare').textContent = 'PKR ' + fare;
  document.getElementById('d-payment-method').textContent = req.paymentMethod === 'cash' ? '💵 Cash' : '📱 Digital';
  document.getElementById('d-net').textContent = 'PKR ' + Math.round(fare * 0.9);
  showNotif('🚗','Ride Started!','Head to ' + req.pickup + ' to pick up ' + req.passenger);
}

function completeRide() {
  if (!state.driver.activeRide) return;
  const fare = state.driver.activeRide.fare;
  const commission = Math.round(fare * 0.1);
  const net = fare - commission;
  state.driver.todayRides++;
  state.driver.todayEarned += net;
  state.driver.todayCommission += commission;
  state.driver.balance += net;

  document.getElementById('d-rides').textContent = state.driver.todayRides;
  document.getElementById('d-earned').textContent = 'PKR ' + state.driver.todayEarned;
  document.getElementById('d-commission').textContent = 'PKR ' + state.driver.todayCommission;

  if (socket?.connected) socket.emit('complete_ride', { rideId: state.driver.activeRide.id });
  showNotif('💰','Ride Complete!','Earned PKR ' + net + ' (PKR ' + commission + ' platform fee)');

  state.driver.activeRide = null;
  document.getElementById('active-ride-panel').style.display = 'none';
  document.getElementById('requests-list').style.display = '';
  state.requests = generateDemoRequests();
  renderRequests();
}

async function loadDriverStats() {
  try {
    const res = await fetch(API + '/driver/stats?id=' + currentUser.id);
    const data = await res.json();
    if (data.success) {
      state.driver.todayEarned = data.todayEarned;
      state.driver.todayRides = data.todayRides;
      state.driver.balance = data.balance;
      document.getElementById('d-rides').textContent = data.todayRides;
      document.getElementById('d-earned').textContent = 'PKR ' + data.todayEarned;
      document.getElementById('withdraw-balance').textContent = 'PKR ' + data.balance;
    }
  } catch(e) { /* demo mode, use local state */ }
}

// =============================================
// WITHDRAW
// =============================================
function showWithdrawModal() {
  document.getElementById('withdraw-balance').textContent = 'PKR ' + state.driver.todayEarned;
  document.getElementById('withdraw-amount').value = '';
  document.getElementById('withdraw-account').value = '';
  document.getElementById('withdraw-modal').classList.add('open');
}
function closeWithdrawModal() { document.getElementById('withdraw-modal').classList.remove('open'); }

async function submitWithdrawal() {
  const method = document.getElementById('withdraw-method').value;
  const account = document.getElementById('withdraw-account').value.trim();
  const amount = parseInt(document.getElementById('withdraw-amount').value);

  if (!account) { showNotif('⚠️','Missing Info','Please enter your account number.'); return; }
  if (!amount || amount < 100) { showNotif('⚠️','Invalid Amount','Minimum withdrawal is PKR 100.'); return; }
  if (amount > state.driver.todayEarned) { showNotif('⚠️','Insufficient Balance','You don\'t have enough earnings.'); return; }

  try {
    const res = await fetch(API + '/driver/withdraw', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ driverId:currentUser.id, method, account, amount })
    });
    const data = await res.json();
    if (data.success) {
      state.driver.todayEarned -= amount;
      document.getElementById('d-earned').textContent = 'PKR ' + state.driver.todayEarned;
      closeWithdrawModal();
      showNotif('💸','Withdrawal Requested!','PKR ' + amount + ' will be sent to your ' + method + ' account within 24 hours.');
    }
  } catch(e) {
    // Demo mode
    state.driver.todayEarned -= amount;
    document.getElementById('d-earned').textContent = 'PKR ' + state.driver.todayEarned;
    closeWithdrawModal();
    showNotif('💸','Withdrawal Requested!','PKR ' + amount + ' via ' + method + ' to ' + account + '. Processing in 24hrs.');
  }
}

// =============================================
// NOTIFICATIONS
// =============================================
function showNotif(icon, title, body) {
  const el = document.getElementById('notification');
  document.getElementById('notif-icon').textContent = icon;
  document.getElementById('notif-title').textContent = title;
  document.getElementById('notif-body').textContent = body;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4500);
}
