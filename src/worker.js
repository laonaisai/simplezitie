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
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) {
      try {
        return await handleAPI(request, env, path);
      } catch (error) {
        return json({ error: "服务器错误: " + error.message }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
