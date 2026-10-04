import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  PenTool,
  RotateCw,
  LogOut,
  Plus,
  ArrowLeft,
  Trash2,
  BookOpen,
  Sparkles,
  Save,
  Eraser,
  Sliders,
  SunMoon,
  Check
} from "lucide-react";
import "./style.css";

const API = "";
const TOKEN_KEY = "zhitie_token";
const USER_KEY = "zhitie_user";
const THEME_KEY = "zhitie_theme";

const FONT_MAP = {
  KaiTi: "font-KaiTi",
  XingKai: "font-XingKai",
  SimSun: "font-SimSun",
  LiSu: "font-LiSu"
};

const FONT_LABEL = {
  KaiTi: "楷体",
  XingKai: "行楷",
  SimSun: "宋体",
  LiSu: "隶书"
};

const THEMES = [
  { id: "retro", name: "宣纸复古" },
  { id: "silk", name: "素绢雅致" },
  { id: "cupcake", name: "清新自然" },
  { id: "light", name: "极简浅白" },
  { id: "dark", name: "水墨夜间" }
];

function api(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = { "Content-Type": "application/json" };
  if (opts.headers) {
    Object.assign(headers, opts.headers);
  }
  if (token) headers["Authorization"] = "Bearer " + token;

  return fetch(API + path, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "请求失败");
    return data;
  });
}

function fetchCaptcha() {
  return fetch(API + "/api/captcha").then((r) => r.json());
}

// 顶部主题切换与导航组件
function Navbar({ user, onLogout, currentTheme, onThemeChange }) {
  return (
    <div className="navbar bg-base-100/90 backdrop-blur shadow-sm rounded-box mb-6 px-4 border border-base-200">
      <div className="flex-1 items-center gap-2">
        <span className="text-2xl">🖌️</span>
        <div>
          <span className="font-bold text-lg tracking-wide">简易中文字帖</span>
          <span className="hidden sm:inline-block ml-2 text-xs opacity-60 font-serif">修身养性 · 提笔练字</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* 主题选择器 */}
        <div className="dropdown dropdown-end">
          <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-1 border border-base-300">
            <SunMoon className="w-4 h-4 opacity-70" />
            <span className="text-xs font-normal hidden sm:inline">
              {THEMES.find((t) => t.id === currentTheme)?.name || "主题"}
            </span>
          </div>
          <ul tabIndex={0} className="dropdown-content z-30 menu p-2 shadow-lg bg-base-100 rounded-box w-36 border border-base-200 text-sm">
            {THEMES.map((t) => (
              <li key={t.id}>
                <button
                  className={`flex items-center justify-between ${currentTheme === t.id ? "active font-bold" : ""}`}
                  onClick={() => onThemeChange(t.id)}
                >
                  {t.name}
                  {currentTheme === t.id && <Check className="w-3.5 h-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-base-200">
            <div className="badge badge-neutral badge-sm py-2.5 px-3 font-medium">
              {user.display_name || user.username}
            </div>
            <button
              onClick={onLogout}
              className="btn btn-ghost btn-circle btn-sm text-error/80 hover:text-error hover:bg-error/10"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 登录与注册页面
function AuthPage({ onLogin, currentTheme, onThemeChange }) {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function loadCaptcha() {
    fetchCaptcha()
      .then((data) => {
        setCaptchaId(data.id);
        setCaptchaQuestion(data.question);
        setCaptchaAnswer("");
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadCaptcha();
  }, []);

  function switchMode(m) {
    setMode(m);
    setError("");
    loadCaptcha();
  }

  function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = mode === "login" ? "/api/login" : "/api/register";
    const payload =
      mode === "login"
        ? { username, password, captcha_id: captchaId, captcha_answer: captchaAnswer }
        : {
            display_name: displayName,
            username,
            password,
            confirm_password: confirmPassword,
            captcha_id: captchaId,
            captcha_answer: captchaAnswer
          };

    api(endpoint, { method: "POST", body: payload })
      .then((data) => {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        onLogin(data.user);
      })
      .catch((err) => {
        setError(err.message);
        loadCaptcha();
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center py-8">
      <div className="w-full max-w-md">
        {/* 顶部简易栏 */}
        <div className="flex justify-end mb-3">
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-xs gap-1 border border-base-300">
              <SunMoon className="w-3.5 h-3.5 opacity-70" />
              <span>{THEMES.find((t) => t.id === currentTheme)?.name || "主题"}</span>
            </div>
            <ul tabIndex={0} className="dropdown-content z-30 menu p-1.5 shadow-lg bg-base-100 rounded-box w-32 border border-base-200 text-xs">
              {THEMES.map((t) => (
                <li key={t.id}>
                  <button
                    className={currentTheme === t.id ? "active font-bold" : ""}
                    onClick={() => onThemeChange(t.id)}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 认证卡片 */}
        <div className="card bg-base-100 shadow-xl border border-base-200 overflow-hidden">
          <div className="card-body p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary text-3xl mb-3 shadow-inner">
                ✍️
              </div>
              <h1 className="text-2xl font-bold tracking-tight">简易中文字帖</h1>
              <p className="text-sm opacity-60 mt-1">云端临摹字帖，随时随地静心书写</p>
            </div>

            {/* 切换 Tab */}
            <div className="grid grid-cols-2 p-1 bg-base-200 rounded-lg mb-6">
              <button
                type="button"
                className={`py-2 text-sm font-semibold rounded-md transition-all ${
                  mode === "login"
                    ? "bg-base-100 text-base-content shadow-sm"
                    : "text-base-content/60 hover:text-base-content"
                }`}
                onClick={() => switchMode("login")}
              >
                登录
              </button>
              <button
                type="button"
                className={`py-2 text-sm font-semibold rounded-md transition-all ${
                  mode === "register"
                    ? "bg-base-100 text-base-content shadow-sm"
                    : "text-base-content/60 hover:text-base-content"
                }`}
                onClick={() => switchMode("register")}
              >
                注册账号
              </button>
            </div>

            {error && (
              <div className="alert alert-error text-sm py-2.5 mb-4 shadow-sm">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="label py-1">
                    <span className="label-text font-medium">您的称呼</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="例如：书香门第"
                    required
                  />
                </div>
              )}

              <div>
                <label className="label py-1">
                  <span className="label-text font-medium">用户名</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label className="label py-1">
                  <span className="label-text font-medium">密码</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
              </div>

              {mode === "register" && (
                <div>
                  <label className="label py-1">
                    <span className="label-text font-medium">确认密码</span>
                  </label>
                  <input
                    type="password"
                    className="input input-bordered w-full"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入密码"
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              <div>
                <label className="label py-1">
                  <span className="label-text font-medium">算术人机验证</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-2 bg-base-200 border border-base-300 rounded-lg font-mono font-bold text-base tracking-wider select-none shrink-0">
                    {captchaQuestion || "加载中..."}
                  </div>
                  <input
                    type="number"
                    className="input input-bordered flex-1"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="结果"
                    required
                  />
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="btn btn-ghost btn-circle border border-base-300"
                    title="刷新验证码"
                  >
                    <RotateCw className="w-4 h-4 opacity-70" />
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-full shadow"
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : mode === "login" ? (
                    "登 录"
                  ) : (
                    "注 册 并 登 录"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// 绘图格子组件
function DrawCell({ char, fontClass, color, brushSize, clearSig, savedStroke }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPt = useRef(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [color, brushSize]);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    if (savedStroke) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
      };
      img.src = savedStroke;
    }
  }, [clearSig, savedStroke]);

  function getPt(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: t.clientX - rect.left,
      y: t.clientY - rect.top
    };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    lastPt.current = getPt(e);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const pt = getPt(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  }

  function end() {
    drawing.current = false;
    lastPt.current = null;
  }

  return (
    <div className="cell">
      <span className={`wm ${fontClass} text-rose-300/80`}>{char}</span>
      <canvas
        ref={canvasRef}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
      />
    </div>
  );
}

// 预览用单格组件
function PreviewCell({ char, fontClass }) {
  return (
    <div className="cell">
      <span className={`wm ${fontClass} text-rose-300/80`}>{char}</span>
    </div>
  );
}

// 字帖创建/编辑/练习页面
function PracticePage({ user, onSave, onBack, initial, currentTheme, onThemeChange, onLogout }) {
  const [title, setTitle] = useState(initial ? initial.title : "");
  const [input, setInput] = useState(initial ? initial.chars : "");
  const [gridSize, setGridSize] = useState(initial ? initial.grid_size : 8);
  const [fontKey, setFontKey] = useState(initial ? initial.font_family : "KaiTi");
  const [color, setColor] = useState("#1a1a1a");
  const [brushSize, setBrushSize] = useState(2.5);
  const [clearSig, setClearSig] = useState(0);
  const [generated, setGenerated] = useState(!!initial);
  const [saving, setSaving] = useState(false);
  const [savedStrokes, setSavedStrokes] = useState(
    initial && initial.strokes ? JSON.parse(initial.strokes) : []
  );
  const [practiceMode, setPracticeMode] = useState(false);

  function generate() {
    const cleaned = input.replace(/\s/g, "");
    if (!cleaned) {
      alert("请先输入需要临摹的汉字！");
      return;
    }
    setGenerated(true);
  }

  function clearAll() {
    if (confirm("确定清空当前字帖的所有手写笔迹吗？")) {
      setClearSig((s) => s + 1);
      setSavedStrokes([]);
    }
  }

  async function save() {
    if (!generated) {
      alert("请先生成字帖！");
      return;
    }
    setSaving(true);
    try {
      const cells = document.querySelectorAll(".cell canvas");
      const strokes = [];
      cells.forEach((c) => {
        try {
          strokes.push(c.toDataURL());
        } catch {
          strokes.push("");
        }
      });
      const payload = {
        title: title || `字帖-${new Date().toLocaleDateString("zh-CN")}`,
        chars: input.replace(/\s/g, ""),
        grid_size: gridSize,
        font_family: fontKey,
        strokes: JSON.stringify(strokes)
      };
      if (initial && initial.id) payload.id = initial.id;
      await onSave(payload);
      alert("字帖保存成功！");
      setPracticeMode(false);
    } catch (e) {
      alert("保存失败: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const chars = input.replace(/\s/g, "");
  const totalCells = gridSize * gridSize;
  const cellChars = [];
  for (let row = 0; row < gridSize; row++) {
    const ch = chars[row % (chars.length || 1)] || "";
    for (let col = 0; col < gridSize; col++) {
      cellChars.push(ch);
    }
  }

  const colors = [
    { value: "#1a1a1a", name: "墨黑" },
    { value: "#c23531", name: "朱砂" },
    { value: "#1565c0", name: "石青" },
    { value: "#2e7d32", name: "翠绿" },
    { value: "#ef6c00", name: "琥珀" }
  ];
  const fontClass = FONT_MAP[fontKey] || "font-KaiTi";

  // 全屏沉浸式书写练习模式
  if (practiceMode) {
    return (
      <div className="fixed inset-0 z-50 bg-base-200 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="navbar bg-base-100 shadow-md border-b border-base-300 px-4 py-2 gap-4 flex-wrap justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPracticeMode(false)}
              className="btn btn-ghost btn-sm gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回设置</span>
            </button>
            <div className="hidden sm:block border-l border-base-300 pl-3">
              <span className="font-bold text-sm tracking-wide">
                {title || "我的字帖"}
              </span>
              <span className="ml-2 text-xs opacity-60">
                {FONT_LABEL[fontKey]} · {gridSize}×{gridSize}格
              </span>
            </div>
          </div>

          {/* 笔刷控制区 */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* 笔色选择器 */}
            <div className="flex items-center gap-1.5 bg-base-200/80 px-2 py-1 rounded-full border border-base-300">
              {colors.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    color === c.value
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-base-100 scale-110"
                      : "opacity-80 hover:opacity-100 hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>

            {/* 笔粗滑块 */}
            <div className="flex items-center gap-2 bg-base-200/80 px-3 py-1 rounded-full border border-base-300 text-xs">
              <span className="opacity-70 font-medium">笔粗</span>
              <input
                type="range"
                min="1"
                max="6"
                step="0.5"
                value={brushSize}
                onChange={(e) => setBrushSize(parseFloat(e.target.value))}
                className="range range-xs range-primary w-20 sm:w-28"
              />
              <span className="font-mono font-bold w-10 text-right">{brushSize}px</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              className="btn btn-ghost btn-sm text-warning hover:bg-warning/10 gap-1"
              title="清空所有笔迹"
            >
              <Eraser className="w-4 h-4" />
              <span className="hidden sm:inline">清空</span>
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn btn-primary btn-sm shadow-sm gap-1"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "保存中..." : "保存字帖"}</span>
            </button>
          </div>
        </div>

        {/* 画布主视区 */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-[850px] shadow-2xl rounded-xl overflow-hidden bg-white border border-base-300">
            <div
              className="gridN"
              style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
            >
              {cellChars.map((ch, i) => (
                <DrawCell
                  key={i}
                  char={ch}
                  fontClass={fontClass}
                  color={color}
                  brushSize={brushSize}
                  clearSig={clearSig}
                  savedStroke={savedStrokes[i] || null}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 设置与编辑面板
  return (
    <div>
      <Navbar
        user={user}
        onLogout={onLogout}
        currentTheme={currentTheme}
        onThemeChange={onThemeChange}
      />

      <div className="mb-4">
        <button onClick={onBack} className="btn btn-ghost btn-sm gap-1">
          <ArrowLeft className="w-4 h-4" />
          <span>返回字帖列表</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 设置表单 */}
        <div className="lg:col-span-1">
          <div className="card bg-base-100 shadow-md border border-base-200 sticky top-4">
            <div className="card-body p-5">
              <h2 className="card-title text-base flex items-center gap-2 pb-2 border-b border-base-200">
                <Sliders className="w-4 h-4 text-primary" />
                <span>字帖配置</span>
              </h2>

              <div className="space-y-4 mt-2">
                <div>
                  <label className="label py-1">
                    <span className="label-text font-medium text-xs">字帖名称</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered input-sm w-full"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例：唐诗三百首精选"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label py-1">
                      <span className="label-text font-medium text-xs">规格 (N×N)</span>
                    </label>
                    <select
                      className="select select-bordered select-sm w-full font-mono"
                      value={gridSize}
                      onChange={(e) => setGridSize(parseInt(e.target.value))}
                    >
                      {[6, 7, 8, 9, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} × {n} 格
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label py-1">
                      <span className="label-text font-medium text-xs">临摹书体</span>
                    </label>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={fontKey}
                      onChange={(e) => setFontKey(e.target.value)}
                    >
                      {Object.keys(FONT_LABEL).map((k) => (
                        <option key={k} value={k}>
                          {FONT_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label py-1 flex justify-between">
                    <span className="label-text font-medium text-xs">临摹汉字</span>
                    <span className="label-text-alt opacity-60 text-xs">
                      {input.replace(/\s/g, "").length} 字
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    className="textarea textarea-bordered w-full font-serif text-base tracking-widest leading-relaxed"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="例如：天地玄黄 宇宙洪荒 日月盈昃 辰宿列张"
                  />
                  <p className="text-xs opacity-60 mt-1">
                    每行自动排列，字数不足时自动循环填充至 {totalCells} 格。
                  </p>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    onClick={generate}
                    className="btn btn-outline btn-primary w-full btn-sm gap-1.5 shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>更新生成预览</span>
                  </button>

                  {generated && (
                    <button
                      onClick={() => setPracticeMode(true)}
                      className="btn btn-primary w-full gap-2 shadow"
                    >
                      <PenTool className="w-4 h-4" />
                      <span>开始临摹练习</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 预览区域 */}
        <div className="lg:col-span-2">
          <div className="card bg-base-100 shadow-md border border-base-200">
            <div className="card-body p-5">
              <div className="flex items-center justify-between pb-3 border-b border-base-200">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span>字帖排版预览</span>
                </h3>
                {generated && (
                  <button
                    onClick={() => setPracticeMode(true)}
                    className="btn btn-primary btn-xs gap-1"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>进入全屏练习</span>
                  </button>
                )}
              </div>

              <div className="py-4">
                {generated ? (
                  <div className="grid-wrap p-2 bg-base-200/50 rounded-xl border border-base-300">
                    <div
                      className="gridN max-w-[650px]"
                      style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
                    >
                      {cellChars.map((ch, i) => (
                        <PreviewCell key={i} char={ch} fontClass={fontClass} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center text-base-content/50">
                    <p className="text-sm">点击左侧「更新生成预览」查看字帖效果</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 字帖列表页面
function ListPage({ user, onLogout, onNew, onOpen, currentTheme, onThemeChange }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api("/api/copybooks");
      setList(data.copybooks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(id, title) {
    if (!confirm(`确定删除字帖「${title || "未命名"}」吗？`)) return;
    api("/api/copybooks/" + id, { method: "DELETE" })
      .then(() => {
        setList((l) => l.filter((c) => c.id !== id));
      })
      .catch((e) => alert("删除失败: " + e.message));
  }

  return (
    <div>
      <Navbar
        user={user}
        onLogout={onLogout}
        currentTheme={currentTheme}
        onThemeChange={onThemeChange}
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">我的字帖</h2>
          <span className="badge badge-neutral badge-sm">{list.length}</span>
        </div>
        <button
          onClick={onNew}
          className="btn btn-primary btn-sm gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>创建新字帖</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="loading loading-spinner loading-md text-primary"></span>
          <span className="text-xs opacity-60">加载字帖库中...</span>
        </div>
      ) : list.length === 0 ? (
        <div className="card bg-base-100 shadow border border-base-200 py-16 text-center">
          <div className="flex flex-col items-center max-w-sm mx-auto px-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4 text-3xl">
              📖
            </div>
            <h3 className="font-bold text-lg mb-1">还没有字帖</h3>
            <p className="text-sm opacity-60 mb-5">
              创建您的专属练字帖，选择喜欢的字体和规格，随时随地在手机或平板上临摹。
            </p>
            <button onClick={onNew} className="btn btn-primary btn-sm gap-1 shadow">
              <Plus className="w-4 h-4" />
              <span>立即创建第一张字帖</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((c) => (
            <div
              key={c.id}
              className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow border border-base-200 overflow-hidden"
            >
              <div className="card-body p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base truncate flex-1" title={c.title}>
                    {c.title || "未命名"}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="badge badge-outline badge-xs py-2">
                      {FONT_LABEL[c.font_family] || "楷体"}
                    </span>
                    <span className="badge badge-ghost badge-xs py-2 font-mono">
                      {c.grid_size || 8}×{c.grid_size || 8}
                    </span>
                  </div>
                </div>

                <div className="my-3 p-3 bg-base-200/50 rounded-lg border border-base-300/50 text-sm font-serif tracking-widest text-base-content/80 truncate">
                  {c.chars || "无字符"}
                </div>

                <div className="card-actions justify-between items-center mt-2 pt-2 border-t border-base-200/60">
                  <span className="text-[11px] opacity-50 font-mono">
                    {c.created_at ? c.created_at.substring(0, 10) : ""}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpen(c)}
                      className="btn btn-primary btn-xs gap-1"
                    >
                      <PenTool className="w-3 h-3" />
                      <span>练习 / 编辑</span>
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.title)}
                      className="btn btn-ghost btn-circle btn-xs text-error/70 hover:text-error hover:bg-error/10"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 主应用入口
function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("list");
  const [editCopybook, setEditCopybook] = useState(null);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || "retro";
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) || "retro";
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  function handleThemeChange(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);
    setCurrentTheme(t);
  }

  useEffect(() => {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch {}
    }
  }, []);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setPage("list");
  }

  function handleSave(data) {
    if (data.id) {
      return api("/api/copybooks/" + data.id, { method: "PUT", body: data }).then(() => {
        setPage("list");
      });
    }
    return api("/api/copybooks", { method: "POST", body: data }).then(() => {
      setPage("list");
    });
  }

  function handleOpen(c) {
    setEditCopybook(c);
    setPage("practice");
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 min-h-screen">
      {!user ? (
        <AuthPage
          onLogin={(u) => {
            setUser(u);
            setPage("list");
          }}
          currentTheme={currentTheme}
          onThemeChange={handleThemeChange}
        />
      ) : page === "practice" ? (
        <PracticePage
          user={user}
          onSave={handleSave}
          onBack={() => {
            setEditCopybook(null);
            setPage("list");
          }}
          initial={editCopybook}
          currentTheme={currentTheme}
          onThemeChange={handleThemeChange}
          onLogout={logout}
        />
      ) : (
        <ListPage
          user={user}
          onLogout={logout}
          onNew={() => {
            setEditCopybook(null);
            setPage("practice");
          }}
          onOpen={handleOpen}
          currentTheme={currentTheme}
          onThemeChange={handleThemeChange}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);