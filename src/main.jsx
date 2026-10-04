import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const h = React.createElement;

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
      h("textarea", { value:input, onChange:function(e){setInput(e.target.value);}, placeholder:"例如：天地玄黄\\n每行显示同一个字，共"+gridSize+"行", rows:3, style:{fontFamily:"KaiTi, 楷体, STKaiti, 华文楷体, LXGW ZhenKai GB, serif", fontSize:18} }),
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