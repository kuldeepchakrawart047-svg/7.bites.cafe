const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "7bites.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  guests INTEGER NOT NULL,
  notes TEXT DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_table_slot
ON bookings(date, time, status) WHERE status != 'cancelled';
`);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname }),
  secret: process.env.SESSION_SECRET || "change-this-secret-before-deploying-7bites",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const clean = (v, max=200) => String(v || "").trim().slice(0, max);
app.get("/api/health", (req,res) => res.json({ok:true, service:"7 Bites Cafe API"}));
app.get("/api/me", (req,res) => {
  if (!req.session.user) return res.json({user:null});
  res.json({user:req.session.user});
});
app.post("/api/register", async (req,res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 160).toLowerCase(), password = String(req.body.password || "");
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return res.status(400).json({error:"Name, valid email and password (at least 8 characters) are required."});
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare("INSERT INTO users (name,email,password_hash) VALUES (?,?,?)").run(name,email,hash);
    req.session.user = {id:info.lastInsertRowid, name, email};
    res.status(201).json({user:req.session.user});
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({error:"An account with this email already exists. Please log in."});
    res.status(500).json({error:"Could not create account. Please try again."});
  }
});
app.post("/api/login", async (req,res) => {
  const email = clean(req.body.email,160).toLowerCase(), password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:"Email or password is incorrect."});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Could not start your session."});
    req.session.user = {id:user.id,name:user.name,email:user.email};
    res.json({user:req.session.user});
  });
});
app.post("/api/logout", (req,res) => req.session.destroy(() => res.json({ok:true})));

function validDateTime(date,time) {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  if (d < today) return false;
  const [h,m] = time.split(":").map(Number);
  const mins = h*60+m;
  return mins >= 600 && mins < 900 && m % 10 === 0;
}
app.get("/api/slots", (req,res) => {
  const date = clean(req.query.date,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:"Choose a valid date."});
  const booked = new Set(db.prepare("SELECT time FROM bookings WHERE date=? AND status!='cancelled'").all(date).map(r=>r.time));
  const slots = [];
  for (let n=600;n<900;n+=10) {
    const time = String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
    slots.push({time, available:!booked.has(time)});
  }
  res.json({slots});
});
app.post("/api/bookings", (req,res) => {
  const name=clean(req.body.name,80), phone=clean(req.body.phone,20), date=clean(req.body.date,10), time=clean(req.body.time,5);
  const guests=Number(req.body.guests), notes=clean(req.body.notes,500);
  const items=Array.isArray(req.body.items) ? req.body.items.slice(0,20).map(i=>({name:clean(i.name,80),qty:Math.max(1,Math.min(20,Number(i.qty)||1)),price:Math.max(0,Number(i.price)||0)})) : [];
  if(name.length<2 || !/^[+()\-\s\d]{8,20}$/.test(phone) || ![1,2,3,4,5,6,7,8].includes(guests) || !validDateTime(date,time)) {
    return res.status(400).json({error:"Please check your details, guest count, date and available 10-minute slot (10:00 AM–3:00 PM)."});
  }
  try {
    const info=db.prepare("INSERT INTO bookings (user_id,name,phone,date,time,guests,notes,items_json) VALUES (?,?,?,?,?,?,?,?)")
      .run(req.session.user?.id || null,name,phone,date,time,guests,notes,JSON.stringify(items));
    res.status(201).json({booking:{id:info.lastInsertRowid,name,phone,date,time,guests,items,status:"confirmed"}});
  } catch(e) {
    if(String(e.message).includes("UNIQUE")) return res.status(409).json({error:"Sorry, that table time was just booked. Please choose another available time."});
    res.status(500).json({error:"Booking could not be saved. Please try again."});
  }
});
app.get("/api/my-bookings", (req,res) => {
  if(!req.session.user) return res.status(401).json({error:"Please log in to view your bookings."});
  const rows=db.prepare("SELECT id,name,date,time,guests,notes,items_json,status,created_at FROM bookings WHERE user_id=? ORDER BY date DESC,time DESC").all(req.session.user.id);
  res.json({bookings:rows.map(r=>({...r,items:JSON.parse(r.items_json)}))});
});
app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`7 Bites Cafe is running at http://localhost:${PORT}`));
