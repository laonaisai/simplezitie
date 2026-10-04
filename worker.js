// 简易中文字帖 — 全栈应用 v5 (React + D1)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "::zhitie-salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function genToken(userId) { return userId + ":" + Date.now() + ":" + Math.random().toString(36).slice(2); }
function json(data, status=200) { return new Response(JSON.stringify(data), { status, headers:{"Content-Type":"application/json"} }); }
function getClientIP(request) { return request.headers.get("CF-Connecting-IP") || "unknown"; }

async function migrate(env) {
  try { await env.DB.prepare("ALTER TABLE users ADD COLUMN display_name TEXT").run(); } catch(e) {}
  try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, fail_count INTEGER DEFAULT 0, locked_until TEXT)").run(); } catch(e) {}
  try { await env.DB.prepare("CREATE TABLE IF NOT EXISTS captcha_challenges (id TEXT PRIMARY KEY, answer TEXT, expires_at TEXT)").run(); } catch(e) {}
}

async function generateCaptcha(env) {
  var a = Math.floor(Math.random() * 9) + 1;
  var b = Math.floor(Math.random() * 9) + 1;
  var answer = String(a + b);
  var id = crypto.randomUUID();
  var expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO captcha_challenges (id, answer, expires_at) VALUES (?, ?, ?)").bind(id, answer, expires).run();
  try { await env.DB.prepare("DELETE FROM captcha_challenges WHERE expires_at < ?").bind(new Date().toISOString()).run(); } catch(e) {}
  return { id: id, question: a + " + " + b + " = ?" };
}

async function verifyCaptcha(env, captchaId, captchaAnswer) {
  if (!captchaId || !captchaAnswer) return false;
  var row = await env.DB.prepare("SELECT answer FROM captcha_challenges WHERE id = ? AND expires_at > ?").bind(captchaId, new Date().toISOString()).first();
  if (!row) return false;
  await env.DB.prepare("DELETE FROM captcha_challenges WHERE id = ?").bind(captchaId).run();
  return row.answer === String(captchaAnswer);
}

async function checkLock(env, ip) {
  var row = await env.DB.prepare("SELECT locked_until FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (!row || !row.locked_until) return false;
  return new Date(row.locked_until) > new Date();
}

async function recordFail(env, ip) {
  var row = await env.DB.prepare("SELECT fail_count FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (!row) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, fail_count, locked_until) VALUES (?, 1, NULL)").bind(ip).run();
    return 1;
  }
  var newCount = row.fail_count + 1;
  if (newCount >= 5) {
    var lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await env.DB.prepare("UPDATE login_attempts SET fail_count = ?, locked_until = ? WHERE ip = ?").bind(newCount, lockedUntil, ip).run();
  } else {
    await env.DB.prepare("UPDATE login_attempts SET fail_count = ? WHERE ip = ?").bind(newCount, ip).run();
  }
  return newCount;
}

async function clearFails(env, ip) {
  try { await env.DB.prepare("UPDATE login_attempts SET fail_count = 0, locked_until = NULL WHERE ip = ?").bind(ip).run(); } catch(e) {}
}

async function getAuthUser(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7); const parts = token.split(":");
  if (parts.length < 1) return null;
  const userId = parseInt(parts[0]); if (!userId) return null;
  return await env.DB.prepare("SELECT id, username, display_name FROM users WHERE id = ?").bind(userId).first();
}

async function handleAPI(request, env, path) {
  await migrate(env);
  const method = request.method;
  const clientIP = getClientIP(request);

  if (path === "/api/captcha" && method === "GET") {
    var captcha = await generateCaptcha(env);
    return json(captcha);
  }

  const body = method !== "GET" && method !== "DELETE" ? await request.json() : null;

  if (path === "/api/register" && method === "POST") {
    const { username, password, confirm_password, display_name, captcha_id, captcha_answer } = body;
    var captchaOk = await verifyCaptcha(env, captcha_id, captcha_answer);
    if (!captchaOk) return json({error:"人机验证失败，请刷新验证码重试"}, 400);
    if (!display_name) return json({error:"称呼必填"}, 400);
    if (!username || !password) return json({error:"用户名和密码必填"}, 400);
    if (username.length < 2) return json({error:"用户名至少2个字符"}, 400);
    if (password.length < 4) return json({error:"密码至少4个字符"}, 400);
    if (password !== confirm_password) return json({error:"两次输入的密码不一致"}, 400);
    const hashed = await hashPassword(password);
    try {
      const result = await env.DB.prepare("INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)").bind(username, hashed, display_name).run();
      return json({ token: genToken(result.meta.last_row_id), user: { id: result.meta.last_row_id, username: username, display_name: display_name } });
    } catch(e) { return json({error:"用户名已存在"}, 400); }
  }

  if (path === "/api/login" && method === "POST") {
    const { username, password, captcha_id, captcha_answer } = body;
    var locked = await checkLock(env, clientIP);
    if (locked) return json({error:"登录失败次数过多，IP已锁定30分钟，请稍后再试"}, 429);
    var captchaOk = await verifyCaptcha(env, captcha_id, captcha_answer);
    if (!captchaOk) return json({error:"人机验证失败，请刷新验证码重试"}, 400);
    if (!username || !password) return json({error:"用户名和密码必填"}, 400);
    const hashed = await hashPassword(password);
    const user = await env.DB.prepare("SELECT id, username, display_name FROM users WHERE username = ? AND password = ?").bind(username, hashed).first();
    if (!user) {
      var failCount = await recordFail(env, clientIP);
      var remaining = 5 - failCount;
      if (remaining <= 0) {
        return json({error:"登录失败次数过多，IP已锁定30分钟，请稍后再试"}, 429);
      }
      return json({error:"用户名或密码错误，剩余尝试次数：" + remaining}, 401);
    }
    await clearFails(env, clientIP);
    return json({ token: genToken(user.id), user: user });
  }

  const user = await getAuthUser(request, env);
  if (!user) return json({error:"未登录"}, 401);

  if (path === "/api/copybooks" && method === "GET") {
    const results = await env.DB.prepare("SELECT * FROM copybooks WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return json({ copybooks: results.results });
  }
  if (path === "/api/copybooks" && method === "POST") {
    const { title, chars, strokes, grid_size, font_family } = body;
    if (!chars) return json({error:"临摹字不能为空"}, 400);
    await env.DB.prepare("INSERT INTO copybooks (user_id, title, chars, strokes, grid_size, font_family) VALUES (?, ?, ?, ?, ?, ?)").bind(user.id, title||"未命名", chars, strokes||"", grid_size||8, font_family||"KaiTi").run();
    return json({ success:true });
  }
  const putMatch = path.match(/^\/api\/copybooks\/(\d+)$/);
  if (putMatch && method === "PUT") {
    const id = parseInt(putMatch[1]);
    const { title, chars, strokes, grid_size, font_family } = body;
    await env.DB.prepare("UPDATE copybooks SET title=?, chars=?, strokes=?, grid_size=?, font_family=? WHERE id=? AND user_id=?").bind(title||"未命名", chars, strokes||"", grid_size||8, font_family||"KaiTi", id, user.id).run();
    return json({ success:true });
  }
  const delMatch = path.match(/^\/api\/copybooks\/(\d+)$/);
  if (delMatch && method === "DELETE") {
    const id = parseInt(delMatch[1]);
    await env.DB.prepare("DELETE FROM copybooks WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    return json({ success:true });
  }
  return json({error:"接口不存在"}, 404);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname;
    if (path === "/favicon.ico") return env.ASSETS.fetch(request);
    if (path.startsWith("/api/")) { try { return await handleAPI(request, env, path); } catch(e) { return json({error:"服务器错误: "+e.message}, 500); } }
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>简易中文字帖</title>
<link rel="icon" href="/favicon.ico" sizes="32x32" type="image/x-icon">
<link rel="preconnect" href="https://fontsapi.zeoseven.com" crossorigin>
<link rel="stylesheet" href="https://fontsapi.zeoseven.com/2/main/result.css">
<link rel="stylesheet" href="https://fontsapi.zeoseven.com/72/main/result.css">
<link rel="stylesheet" href="https://fontsapi.zeoseven.com/864/main/result.css">
<script src="https://cdn.bootcdn.net/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.bootcdn.net/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { font-family:"PingFang SC","Microsoft YaHei",sans-serif; background:#f5f5f5; color:#333; }
  #root { max-width:900px; margin:0 auto; padding:16px; }
  h1 { text-align:center; margin-bottom:16px; color:#2c3e50; font-size:24px; }
  .panel { background:#fff; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,.08); margin-bottom:16px; }
  label { font-size:15px; font-weight:600; display:block; margin-bottom:8px; }
  input[type=text], input[type=password], input[type=number], textarea, select {
    width:100%; font-size:16px; padding:10px 12px; border:2px solid #ddd; border-radius:8px; background:#fff;
  }
  input:focus, textarea:focus, select:focus { border-color:#e91e63; outline:none; }
  .hint { font-size:12px; color:#999; margin-top:6px; }
  .btn { padding:10px 24px; border:none; border-radius:8px; font-size:16px; cursor:pointer; font-weight:600; }
  .btn-primary { background:#e91e63; color:#fff; }
  .btn-secondary { background:#e0e0e0; color:#333; }
  .btn-danger { background:#f44336; color:#fff; }
  .btn-row { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
  .nav { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
  .nav .user { font-size:14px; color:#666; }
  .grid-wrap { overflow:auto; }
  .gridN { display:grid; border:2px solid #bbb; margin:0 auto; max-width:100%; }
  .cell { position:relative; aspect-ratio:1; border:1px solid #d0d0d0; display:flex; align-items:center; justify-content:center; background:#fff; container-type:inline-size; }
  .cell::before { content:''; position:absolute; left:0; right:0; top:50%; height:0; border-top:1px dashed #d8d8d8; }
  .cell::after { content:''; position:absolute; top:0; bottom:0; left:50%; width:0; border-left:1px dashed #d8d8d8; }
  .cell canvas { position:absolute; top:0; left:0; width:100%; height:100%; z-index:2; touch-action:none; }
  .wm { z-index:1; user-select:none; line-height:1; font-size:80cqw; }
  .font-KaiTi { font-family:"KaiTi","楷体","STKaiti","华文楷体","LXGW ZhenKai GB",serif; }
  .font-XingKai { font-family:"STXingkai","STXingKai","华文行楷","行楷","Zhi Mang Xing",cursive; }
  .font-SimSun { font-family:"SimSun","STSong","宋体",serif; }
  .font-LiSu { font-family:"LiSu","隶书","STLiti","华文隶书","USMCChuibolishu",serif; }
  .list-item { display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; }
  .list-item:last-child { border-bottom:none; }
  .list-item .info { flex:1; }
  .list-item .info h3 { font-size:16px; margin-bottom:4px; }
  .list-item .info p { font-size:13px; color:#999; }
  .empty { text-align:center; padding:40px; color:#999; }
  .err { color:#f44336; font-size:14px; margin-top:8px; }
  .tools { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; align-items:center; }
  .color-pick { width:32px; height:32px; border-radius:50%; border:2px solid #ddd; cursor:pointer; }
  .color-pick.active { border-color:#333; }
  .slider-wrap { display:flex; align-items:center; gap:10px; }
  .slider-wrap input[type=range] { width:100px; }
  .field-row { display:flex; gap:12px; flex-wrap:wrap; }
  .field-row > div { flex:1; min-width:140px; }
  .stroke-preview { border:2px solid #ddd; border-radius:8px; padding:4px 12px; font-size:14px; }
  .practice-modal { position:fixed; top:0; left:0; right:0; bottom:0; background:#f5f5f5; z-index:100; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:16px; }
  .captcha-row { display:flex; align-items:center; gap:10px; }
  .captcha-q { font-size:18px; font-weight:700; color:#333; background:#f0f0f0; padding:8px 14px; border-radius:8px; white-space:nowrap; letter-spacing:1px; }
  .captcha-refresh { font-size:13px; color:#e91e63; cursor:pointer; text-decoration:underline; background:none; border:none; }
</style>
</head>
<body>
<div id="root"></div>
<script>
var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;
var createRoot = ReactDOM.createRoot;
var h = React.createElement;

var API = "";
var TOKEN_KEY = "zhitie_token";
var USER_KEY = "zhitie_user";
var FONT_MAP = { KaiTi:"font-KaiTi", XingKai:"font-XingKai", SimSun:"font-SimSun", LiSu:"font-LiSu" };
var FONT_LABEL = { KaiTi:"楷体", XingKai:"行楷", SimSun:"宋体", LiSu:"隶书" };

function api(path, opts) {
  opts = opts || {};
  var token = localStorage.getItem(TOKEN_KEY);
  var headers = { "Content-Type":"application/json" };
  if (opts.headers) { var k; for (k in opts.headers) { headers[k] = opts.headers[k]; } }
  if (token) headers["Authorization"] = "Bearer " + token;
  return fetch(API+path, { method:opts.method||"GET", headers:headers, body:opts.body?JSON.stringify(opts.body):undefined }).then(function(r) {
    return r.json().then(function(data) {
      if (!r.ok) throw new Error(data.error||"请求失败");
      return data;
    });
  });
}

function fetchCaptcha() {
  return fetch(API+"/api/captcha").then(function(r) { return r.json(); });
}

function AuthPage(_ref) {
  var onLogin = _ref.onLogin;
  var mode = useState("login");
  var setMode = mode[1]; mode = mode[0];
  var displayName = useState(""); var setDisplayName = displayName[1]; displayName = displayName[0];
  var username = useState(""); var setUsername = username[1]; username = username[0];
  var password = useState(""); var setPassword = password[1]; password = password[0];
  var confirmPassword = useState(""); var setConfirmPassword = confirmPassword[1]; confirmPassword = confirmPassword[0];
  var captchaId = useState(""); var setCaptchaId = captchaId[1]; captchaId = captchaId[0];
  var captchaQuestion = useState(""); var setCaptchaQuestion = captchaQuestion[1]; captchaQuestion = captchaQuestion[0];
  var captchaAnswer = useState(""); var setCaptchaAnswer = captchaAnswer[1]; captchaAnswer = captchaAnswer[0];
  var error = useState(""); var setError = error[1]; error = error[0];
  var loading = useState(false); var setLoading = loading[1]; loading = loading[0];

  function loadCaptcha() {
    fetchCaptcha().then(function(data) {
      setCaptchaId(data.id);
      setCaptchaQuestion(data.question);
      setCaptchaAnswer("");
    }).catch(function() {});
  }

  useEffect(function() { loadCaptcha(); }, []);

  function switchMode(m) {
    setMode(m);
    setError("");
    loadCaptcha();
  }

  function submit(e) {
    e.preventDefault(); setError(""); setLoading(true);
    var endpoint = mode === "login" ? "/api/login" : "/api/register";
    var payload;
    if (mode === "login") {
      payload = { username:username, password:password, captcha_id:captchaId, captcha_answer:captchaAnswer };
    } else {
      payload = { display_name:displayName, username:username, password:password, confirm_password:confirmPassword, captcha_id:captchaId, captcha_answer:captchaAnswer };
    }
    api(endpoint, { method:"POST", body:payload }).then(function(data) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      onLogin(data.user);
    }).catch(function(err) {
      setError(err.message);
      loadCaptcha();
    });
    setLoading(false);
  }

  var fields = [];
  if (mode === "register") {
    fields.push(h("div", { key:"dn" }, h("label", null, "称呼"), h("input", { type:"text", value:displayName, onChange:function(e){setDisplayName(e.target.value);}, placeholder:"请输入您的称呼", required:true })));
  }
  fields.push(h("div", { key:"un", style:{marginTop:12} }, h("label", null, "用户名"), h("input", { type:"text", value:username, onChange:function(e){setUsername(e.target.value);}, placeholder:"请输入用户名", required:true, autoComplete:"username" })));
  fields.push(h("div", { key:"pw", style:{marginTop:12} }, h("label", null, "密码"), h("input", { type:"password", value:password, onChange:function(e){setPassword(e.target.value);}, placeholder:"请输入密码", required:true, autoComplete:mode==="login"?"current-password":"new-password" })));
  if (mode === "register") {
    fields.push(h("div", { key:"cpw", style:{marginTop:12} }, h("label", null, "确认密码"), h("input", { type:"password", value:confirmPassword, onChange:function(e){setConfirmPassword(e.target.value);}, placeholder:"请再次输入密码", required:true, autoComplete:"new-password" })));
  }
  fields.push(h("div", { key:"cap", style:{marginTop:12} },
    h("label", null, "人机验证"),
    h("div", { className:"captcha-row" },
      h("span", { className:"captcha-q" }, captchaQuestion || "加载中..."),
      h("input", { type:"number", value:captchaAnswer, onChange:function(e){setCaptchaAnswer(e.target.value);}, placeholder:"答案", required:true, style:{flex:1} }),
      h("button", { type:"button", className:"captcha-refresh", onClick:loadCaptcha }, "刷新")
    )
  ));

  return h("div", { className:"panel", style:{maxWidth:380,margin:"60px auto"} },
    h("h1", null, "📝 简易中文字帖"),
    h("div", { style:{display:"flex",gap:8,marginBottom:16} },
      h("button", { className:mode==="login"?"btn btn-primary":"btn btn-secondary", onClick:function(){switchMode("login");}, style:{flex:1} }, "登录"),
      h("button", { className:mode==="register"?"btn btn-primary":"btn btn-secondary", onClick:function(){switchMode("register");}, style:{flex:1} }, "注册")
    ),
    h("form", { onSubmit:submit },
      fields,
      error && h("div", { className:"err" }, error),
      h("div", { className:"btn-row" },
        h("button", { type:"submit", className:"btn btn-primary", style:{flex:1}, disabled:loading }, loading?"处理中...":(mode==="login"?"登录":"注册"))
      )
    )
  );
}

function DrawCell(_ref) {
  var char = _ref.char, fontClass = _ref.fontClass, color = _ref.color, brushSize = _ref.brushSize, clearSig = _ref.clearSig, savedStroke = _ref.savedStroke;
  var canvasRef = useRef(null);
  var drawing = useRef(false);
  var lastPt = useRef(null);
  var setupCanvas = useCallback(function() {
    var canvas = canvasRef.current; if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect(); if (rect.width === 0) return;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    var ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    ctx.strokeStyle = color; ctx.lineWidth = brushSize; ctx.lineCap = "round"; ctx.lineJoin = "round";
  }, [color, brushSize]);
  useEffect(function() { setupCanvas(); }, [setupCanvas]);
  useEffect(function() {
    var canvas = canvasRef.current; if (!canvas) return;
    var ctx = canvas.getContext("2d"); var dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width/dpr, canvas.height/dpr);
    if (savedStroke) { var img = new Image(); img.onload = function() { ctx.drawImage(img, 0, 0, canvas.width/dpr, canvas.height/dpr); }; img.src = savedStroke; }
  }, [clearSig, savedStroke]);
  function getPt(e) { var canvas = canvasRef.current; var rect = canvas.getBoundingClientRect(); var t = e.touches ? e.touches[0] : e; return { x: t.clientX - rect.left, y: t.clientY - rect.top }; }
  function start(e) { e.preventDefault(); drawing.current = true; lastPt.current = getPt(e); }
  function move(e) { if (!drawing.current) return; e.preventDefault(); var pt = getPt(e); var ctx = canvasRef.current.getContext("2d"); ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(pt.x, pt.y); ctx.stroke(); lastPt.current = pt; }
  function end() { drawing.current = false; lastPt.current = null; }
  return h("div", { className:"cell" },
    h("span", { className:"wm "+fontClass, style:{color:"#ffb3c8"} }, char),
    h("canvas", { ref:canvasRef, onTouchStart:start, onTouchMove:move, onTouchEnd:end, onMouseDown:start, onMouseMove:move, onMouseUp:end, onMouseLeave:end })
  );
}

function PreviewCell(_ref) {
  var char = _ref.char, fontClass = _ref.fontClass;
  return h("div", { className:"cell" },
    h("span", { className:"wm "+fontClass, style:{color:"#ffb3c8"} }, char)
  );
}

function PracticePage(_ref) {
  var user = _ref.user, onSave = _ref.onSave, onBack = _ref.onBack, initial = _ref.initial;
  var title = useState(initial ? initial.title : ""); var setTitle = title[1]; title = title[0];
  var input = useState(initial ? initial.chars : ""); var setInput = input[1]; input = input[0];
  var gridSize = useState(initial ? initial.grid_size : 8); var setGridSize = gridSize[1]; gridSize = gridSize[0];
  var fontKey = useState(initial ? initial.font_family : "KaiTi"); var setFontKey = fontKey[1]; fontKey = fontKey[0];
  var color = useState("#333333"); var setColor = color[1]; color = color[0];
  var brushSize = useState(2.5); var setBrushSize = brushSize[1]; brushSize = brushSize[0];
  var clearSig = useState(0); var setClearSig = clearSig[1]; clearSig = clearSig[0];
  var generated = useState(!!initial); var setGenerated = generated[1]; generated = generated[0];
  var saving = useState(false); var setSaving = saving[1]; saving = saving[0];
  var savedStrokes = useState(initial && initial.strokes ? JSON.parse(initial.strokes) : []); var setSavedStrokes = savedStrokes[1]; savedStrokes = savedStrokes[0];
  var practiceMode = useState(false); var setPracticeMode = practiceMode[1]; practiceMode = practiceMode[0];

  function generate() { var cleaned = input.replace(/\\s/g,""); if (!cleaned) { alert("请先输入需要临摹的字！"); return; } setGenerated(true); }
  function clearAll() { setClearSig(function(s) { return s + 1; }); setSavedStrokes([]); }
  function save() {
    if (!generated) { alert("请先生成字帖！"); return; } setSaving(true);
    try {
      var cells = document.querySelectorAll(".cell canvas"); var strokes = [];
      cells.forEach(function(c) { try { strokes.push(c.toDataURL()); } catch(e) { strokes.push(""); } });
      var payload = { title: title||("字帖-"+new Date().toLocaleDateString("zh-CN")), chars: input.replace(/\\s/g,""), grid_size:gridSize, font_family:fontKey, strokes:JSON.stringify(strokes) };
      if (initial && initial.id) payload.id = initial.id;
      onSave(payload).then(function() { alert("保存成功！"); setPracticeMode(false); }).catch(function(e) { alert("保存失败: " + e.message); });
    } catch(e) { alert("保存失败: " + e.message); }
    setSaving(false);
  }

  var chars = input.replace(/\\s/g,""); var totalCells = gridSize * gridSize; var cellChars = [];
  for (var row = 0; row < gridSize; row++) { var ch = chars[row % chars.length] || ""; for (var col = 0; col < gridSize; col++) { cellChars.push(ch); } }
  var colors = ["#333333","#e91e63","#1565c0","#2e7d32","#ef6c00"];
  var fontClass = FONT_MAP[fontKey] || "font-KaiTi";

  if (practiceMode) {
    return h("div", { className:"practice-modal" },
      h("div", { className:"nav" },
        h("button", { className:"btn btn-secondary", onClick:function(){setPracticeMode(false);} }, "← 返回设置"),
        h("div", null,
          h("button", { className:"btn btn-secondary", style:{padding:"6px 16px",fontSize:14,marginRight:8}, onClick:clearAll }, "清空笔迹"),
          h("button", { className:"btn btn-primary", style:{padding:"6px 16px",fontSize:14}, onClick:save, disabled:saving }, saving?"保存中...":"保存字帖")
        )
      ),
      h("div", { className:"tools" },
        h("span", { style:{fontSize:14} }, "笔色："),
        colors.map(function(c) { return h("div", { key:c, className:"color-pick"+(color===c?" active":""), style:{background:c}, onClick:function(){setColor(c);} }); }),
        h("span", { style:{fontSize:14,marginLeft:8} }, "笔粗："),
        h("div", { className:"slider-wrap" },
          h("input", { type:"range", min:"1", max:"6", step:"0.5", value:brushSize, onChange:function(e){setBrushSize(parseFloat(e.target.value));} }),
          h("span", { className:"stroke-preview" }, brushSize+"px")
        )
      ),
      h("div", { className:"grid-wrap" },
        h("div", { className:"gridN", style:{gridTemplateColumns:"repeat("+gridSize+", 1fr)"} },
          cellChars.map(function(ch, i) { return h(DrawCell, { key:i, char:ch, fontClass:fontClass, color:color, brushSize:brushSize, clearSig:clearSig, savedStroke:savedStrokes[i]||null }); })
        )
      )
    );
  }

  return h(React.Fragment, null,
    h("div", { className:"nav" },
      h("button", { className:"btn btn-secondary", onClick:onBack }, "← 返回列表"),
      h("span", { className:"user" }, user.display_name || user.username)
    ),
    h("div", { className:"panel" },
      h("label", null, "字帖标题"),
      h("input", { type:"text", value:title, onChange:function(e){setTitle(e.target.value);}, placeholder:"给字帖起个名字" }),
      h("div", { className:"field-row", style:{marginTop:12} },
        h("div", null,
          h("label", null, "格子数 (N×N)"),
          h("select", { value:gridSize, onChange:function(e){setGridSize(parseInt(e.target.value));} }, [6,7,8,9,10,12].map(function(n) { return h("option", { key:n, value:n }, n+"×"+n); }))
        ),
        h("div", null,
          h("label", null, "字体"),
          h("select", { value:fontKey, onChange:function(e){setFontKey(e.target.value);} }, Object.keys(FONT_LABEL).map(function(k) { return h("option", { key:k, value:k }, FONT_LABEL[k]); }))
        )
      ),
      h("label", { style:{marginTop:12} }, "输入需要临摹的字（每行一个字，按顺序排列）"),
      h("textarea", { value:input, onChange:function(e){setInput(e.target.value);}, placeholder:"例如：天地玄黄\\n每行显示同一个字，共"+gridSize+"行", rows:3, style:{fontFamily:"LXGW WenKai, KaiTi, STKaiti, 楷体, serif", fontSize:18} }),
      h("div", { className:"hint" }, "每行对应一个临摹字，整行重复显示该字。共"+gridSize+"行×"+gridSize+"列="+totalCells+"格。"),
      h("div", { className:"btn-row" },
        h("button", { className:"btn btn-primary", onClick:generate }, "生成字帖"),
        generated && h("button", { className:"btn btn-primary", onClick:function(){setPracticeMode(true);} }, "✏️ 开始练习")
      )
    ),
    generated && h("div", { className:"panel" },
      h("h3", { style:{marginBottom:12,fontSize:16} }, "预览（点击「开始练习」进入书写）"),
      h("div", { className:"grid-wrap" },
        h("div", { className:"gridN", style:{gridTemplateColumns:"repeat("+gridSize+", 1fr)"} },
          cellChars.map(function(ch, i) { return h(PreviewCell, { key:i, char:ch, fontClass:fontClass }); })
        )
      )
    )
  );
}

function ListPage(_ref) {
  var user = _ref.user, onLogout = _ref.onLogout, onNew = _ref.onNew, onOpen = _ref.onOpen;
  var list = useState([]); var setList = list[1]; list = list[0];
  var loading = useState(true); var setLoading = loading[1]; loading = loading[0];
  var load = useCallback(async function() { try { var data = await api("/api/copybooks"); setList(data.copybooks || []); } catch(e) { console.error(e); } setLoading(false); }, []);
  useEffect(function() { load(); }, [load]);
  function handleDelete(id) { if (!confirm("确定删除这个字帖吗？")) return; api("/api/copybooks/"+id, { method:"DELETE" }).then(function() { setList(function(l) { return l.filter(function(c) { return c.id !== id; }); }); }).catch(function(e) { alert("删除失败: " + e.message); }); }
  return h(React.Fragment, null,
    h("div", { className:"nav" },
      h("h1", { style:{margin:0,fontSize:22} }, "📝 简易中文字帖"),
      h("div", null, h("span", { className:"user", style:{marginRight:12} }, user.display_name || user.username), h("button", { className:"btn btn-secondary", onClick:onLogout, style:{padding:"6px 16px",fontSize:14} }, "退出"))
    ),
    h("div", { className:"btn-row" }, h("button", { className:"btn btn-primary", onClick:onNew }, "＋ 创建字帖")),
    loading ? h("div", { className:"empty" }, "加载中...") :
    list.length === 0 ? h("div", { className:"empty" }, "还没有字帖，点击上方按钮创建") :
    h("div", { className:"panel" },
      list.map(function(c) { return h("div", { key:c.id, className:"list-item" },
        h("div", { className:"info" },
          h("h3", null, c.title),
          h("p", null, (FONT_LABEL[c.font_family]||"楷体")+" · "+(c.grid_size||8)+"×"+(c.grid_size||8)+" · ", c.chars.substring(0,15)+(c.chars.length>15?"...":""), " · ", c.created_at)
        ),
        h("div", null,
          h("button", { className:"btn btn-secondary", style:{padding:"6px 14px",fontSize:14,marginRight:8}, onClick:function(){onOpen(c);} }, "打开"),
          h("button", { className:"btn btn-danger", style:{padding:"6px 14px",fontSize:14}, onClick:function(){handleDelete(c.id);} }, "删除")
        )
      ); })
    )
  );
}

function App() {
  var user = useState(null); var setUser = user[1]; user = user[0];
  var page = useState("list"); var setPage = page[1]; page = page[0];
  var editCopybook = useState(null); var setEditCopybook = editCopybook[1]; editCopybook = editCopybook[0];
  useEffect(function() { var saved = localStorage.getItem(USER_KEY); if (saved) setUser(JSON.parse(saved)); }, []);
  function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setUser(null); setPage("list"); }
  function handleSave(data) {
    if (data.id) { return api("/api/copybooks/"+data.id, { method:"PUT", body:data }).then(function() { setPage("list"); }); }
    return api("/api/copybooks", { method:"POST", body:data }).then(function() { setPage("list"); });
  }
  function handleOpen(c) { setEditCopybook(c); setPage("practice"); }
  if (!user) return h(AuthPage, { onLogin:function(u) { setUser(u); setPage("list"); } });
  if (page === "practice") return h(PracticePage, { user:user, onSave:handleSave, onBack:function() { setEditCopybook(null); setPage("list"); }, initial: editCopybook });
  return h(ListPage, { user:user, onLogout:logout, onNew:function() { setEditCopybook(null); setPage("practice"); }, onOpen:handleOpen });
}

createRoot(document.getElementById("root")).render(h(App));
</script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type":"text/html; charset=utf-8" } });
  }
};