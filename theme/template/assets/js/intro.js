/* Forti-Legends theme: front-page mini game (ES module, homepage only).
 *
 * Throw the handball into the goal. Phone: swipe in any direction; tilting
 * the phone moves the camera a little, the same way as the mouse on a
 * computer. Desktop: point with the mouse (an arrow shows the direction) and
 * click. The ball is thrown from hand height. Aimed at the goal it curves in
 * and cannot miss. Aimed left or right of the goal it can hit a sideline
 * advertising board (only if the aim is on the visible board, not the
 * posts). A hit asks whether to open that advertiser. The net
 * swings, the ball drops and rolls back towards the visitor. The title slides in over the
 * scene at the hit. The ball rolls back and on down the page in one motion
 * while the page scrolls along and the title travels down and turns into the
 * hero title; it all ends with the hero at the top of the screen and the
 * ball resting next to the hero title, logo to the front. Scrolling before
 * the throw skips straight to that end state; clicking the resting ball
 * plays again.
 *
 * Above the goal hangs a hall scoreboard (a canvas texture): team names,
 * score, period, game clock counting up and a penalty timer counting down.
 * The score goes up by one when the ball hits the net. Sports boards hang
 * to the left and right of the scoreboard, top and bottom flush with it,
 * with no poles (left: IT sponsoring with the damianmoser.ch look and a
 * live fake terminal; right: for sale).
 *
 * three.js comes from jsdelivr through the import map in base.html. The
 * models are loaded from the paths given in the front matter (intro.ball_model,
 * intro.goal_model). Without them, or if they fail, a built-in look-alike is
 * used: a red / navy handball with white speed lines and the site name as a
 * wordmark, and a cartoon goal with red/white posts. A loaded goal is
 * recoloured (its black parts become red, #e11c1e) and outlined so the white
 * parts stay visible on the white stage; a loaded ball keeps its colours.
 *
 * Two canvases: the stage (goal, net, ball) and a small "page ball" canvas
 * that carries the ball out of the stage and down to the hero title.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const RED = 0xe11c1e;
const WHITE = 0xffffff;
const INK = 0x111111;
const GOAL_W = 3; // inner width (m)
const GOAL_H = 2; // inner height
const POST = 0.12; // post thickness
const NET_TOP = 0.8; // net depth at the crossbar
const NET_BOTTOM = 1.1; // net depth on the ground
const BALL_R = 0.165;
const GRAVITY = 9.8;
const START = new THREE.Vector3(0, 1.05, 3.0); // in the hand, half goal height
const PAGE_FOV = 28; // camera of the page-ball canvas
const PAGE_PAD = 1.15; // canvas half size / ball radius
const BOARD_W = 2.4; // scoreboard size (m)
const BOARD_H = 1.8;
const BOARD_Z = -1.3; // behind the net
const BOARD_LIFT = 0.28; // gap between the crossbar and the board
const SCORE_BOTTOM = GOAL_H + POST + BOARD_LIFT;
const SCORE_TOP = SCORE_BOTTOM + BOARD_H;
const AD_W = 1.1; // advertising boards on the scoreboard wall (m)
const AD_H = BOARD_H; // top and bottom flush with the scoreboard
const AD_D = 0.12;
const AD_LIFT = SCORE_BOTTOM; // hanging, no pole
const AD_GAP = 0.2; // gap between scoreboard edge and a board

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function boot(intro) {
  const stage = intro.querySelector(".intro__stage");
  const title = intro.querySelector(".intro__title");
  const hint = intro.querySelector(".intro__hint");
  const aim = intro.querySelector(".intro__aim");
  const aimLine = aim ? aim.querySelector("line") : null;
  const aimHead = aim ? aim.querySelector("polygon") : null;
  const heroTitle = document.querySelector(".hero__title");
  const adPrompt = intro.querySelector(".intro__adprompt");
  const adPromptAsk = adPrompt ? adPrompt.querySelector("[data-ad-ask]") : null;
  const adPromptBlurb = adPrompt ? adPrompt.querySelector("[data-ad-blurb]") : null;
  const adPromptGo = adPrompt ? adPrompt.querySelector("[data-ad-go]") : null;
  const adPromptNo = adPrompt ? adPrompt.querySelector("[data-ad-no]") : null;
  if (!stage) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 900);
  const hints = {
    aim: intro.dataset.hintAim || (coarse ? "Wüsch, zum de Ball wörfe" : "Klick, zum de Ball wörfe"),
    done: intro.dataset.hintDone || "Scrolle ↓",
    again: coarse ? "Tipp uf de Ball für nomol" : "Klick uf de Ball für nomol",
  };

  /* Phone tilt uses the same camera look as the desktop mouse: -1..1 in
   * screen space (x right, y down). Origin is the hold when aiming starts.
   * ~18° of tilt matches the mouse at the edge of the stage. */
  const GYRO_RANGE = 18;
  let gyroLook = null;
  let gyroOrigin = null;
  let gyroListening = false;

  function screenAngle() {
    const o = window.screen && window.screen.orientation;
    if (o && typeof o.angle === "number") return ((o.angle % 360) + 360) % 360;
    if (typeof window.orientation === "number") return ((window.orientation % 360) + 360) % 360;
    return 0;
  }

  function tiltXY(beta, gamma) {
    let x = gamma;
    let y = beta;
    const a = screenAngle();
    if (a === 90) {
      x = beta;
      y = -gamma;
    } else if (a === 180) {
      x = -gamma;
      y = -beta;
    } else if (a === 270) {
      x = -beta;
      y = gamma;
    }
    return { x, y };
  }

  function onDeviceOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const t = tiltXY(e.beta, e.gamma);
    if (!gyroOrigin) gyroOrigin = t;
    gyroLook = {
      x: clamp((t.x - gyroOrigin.x) / GYRO_RANGE, -1, 1),
      y: clamp((t.y - gyroOrigin.y) / GYRO_RANGE, -1, 1),
    };
  }

  function startGyro() {
    if (gyroListening || reduce) return;
    gyroListening = true;
    window.addEventListener("deviceorientation", onDeviceOrient);
  }

  function requestGyroPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE || typeof DOE.requestPermission !== "function") return;
    DOE.requestPermission()
      .then((state) => {
        if (state === "granted") startGyro();
      })
      .catch(() => {});
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    intro.classList.add("is-static");
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.insertBefore(renderer.domElement, stage.firstChild);
  intro.classList.add("is-ready");

  if (coarse && !reduce && window.DeviceOrientationEvent) {
    startGyro();
    if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
      const once = () => {
        window.removeEventListener("pointerdown", once, true);
        requestGyroPermission();
      };
      window.addEventListener("pointerdown", once, true);
    }
  }

  /* ---------------------------------------------------------------- scene */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
  const camRest = { pos: new THREE.Vector3(0, 1.45, 6.2), look: new THREE.Vector3(0, 1.3, 0) };
  const camTarget = camRest.pos.clone();
  camera.position.copy(camRest.pos);
  camera.lookAt(camRest.look);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b7b0, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(5, 3, -4);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.24 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(80, 80, 0xd9d7cf, 0xd9d7cf);
  grid.position.y = 0.002;
  scene.add(grid);
  // the floor grid fades into the page colour instead of ending in a hard line
  const bg = new THREE.Color(getComputedStyle(stage).backgroundColor || "#f5f4ef");
  scene.fog = new THREE.Fog(bg, 9, 34);

  /* Ball: pivot (position) + mesh group (rotation). The mesh group moves to
   * the page-ball canvas at the end. */
  const ball = new THREE.Group();
  const ballMesh = new THREE.Group();
  ball.add(ballMesh);
  // while the ball is drawn on the page canvas (from the roll-back on) this
  // invisible stand-in keeps casting its shadow on the stage floor
  const shadowProxy = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  shadowProxy.castShadow = true;
  shadowProxy.visible = false;
  ball.add(shadowProxy);
  const builtIn = buildBall();
  ballMesh.add(builtIn.mesh);
  let frontQ = builtIn.front; // orientation with the logo to the front
  ball.position.copy(START);
  scene.add(ball);

  /* Goal: group at the origin, opening towards the camera (+z) */
  let goal = buildGoal();
  let net = goal.userData.net; // { apply(impact, push, amp) }
  scene.add(goal);

  /* Scoreboard above the goal, advertising boards to its left and right */
  const board = intro.dataset.board === "off" ? null : buildBoard(boardConfig(intro.dataset));
  if (board) scene.add(board.object);
  const ads = intro.dataset.ads === "off" ? null : buildAds(adsConfig(intro.dataset));
  if (ads) {
    scene.add(ads.left.object);
    scene.add(ads.right.object);
  }
  let fromAd = false; // drop after hitting a board: do not trap the ball in the goal
  let adPromptOpen = false;
  let adPromptHref = "";

  /* ------------------------------------------------------------- loading */
  const loader = new GLTFLoader();
  loadModel(intro.dataset.ball, (obj) => {
    if (state !== "aim") return;
    const fitted = fitBall(obj);
    if (fitted) {
      ballMesh.clear();
      ballMesh.add(fitted);
      const e = (intro.dataset.ballFront || "0,0,0").split(",").map((n) => (parseFloat(n) || 0) * (Math.PI / 180));
      frontQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    }
  });
  loadModel(intro.dataset.goal, (obj) => {
    if (state !== "aim") return;
    const fitted = fitGoal(obj, parseFloat(intro.dataset.goalRotation || "0"));
    if (fitted) {
      scene.remove(goal);
      goal = fitted;
      net = goal.userData.net;
      scene.add(goal);
    }
  });

  function loadModel(url, cb) {
    if (!url) return;
    loader.load(
      url,
      (gltf) => {
        try {
          cb(gltf.scene);
        } catch (e) {
          console.warn("intro: model could not be used", url, e);
        }
      },
      undefined,
      (e) => console.warn("intro: model could not be loaded, using the built-in one", url, e)
    );
  }

  /* ---------------------------------------------------------------- state */
  let state = "aim"; // aim | flight | drop | roll | page | done
  let flight = null;
  let drop = null;
  let roll = null;
  let page = null; // roll down the page
  let netHit = null;
  let pointer = null; // last pointer position in stage px
  let drag = null; // touch swipe in progress
  let restT = 0;
  let follow = false; // page scroll follows the ball
  let ignoreScrollUntil = 0; // our own scroll-to-top after a replay
  const raycaster = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function setHint(text) {
    if (!hint) return;
    hint.textContent = text || "";
    hint.classList.toggle("is-hidden", !text);
  }

  function enterAim() {
    state = "aim";
    gyroOrigin = null;
    gyroLook = null;
    intro.classList.add("is-aiming");
    intro.classList.remove("is-done");
    setHint(hints.aim);
    if (heroTitle) heroTitle.classList.add("is-hidden");
  }

  function resetTitle() {
    if (!title) return;
    title.classList.remove("is-in", "is-moving", "is-gone");
    title.style.transform = "";
  }

  /* The stage title must break exactly like the hero title (one line, or
   * "FORTI-" / "LEGENDS"), so that the move + scale down the page lands as
   * the same shape. In one-line mode the font shrinks until it fits the stage. */
  function syncTitleLines() {
    if (!title || state === "page") return;
    let lines = 2;
    if (heroTitle && heroTitle.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(heroTitle);
      const tops = new Set();
      for (const r of range.getClientRects()) tops.add(Math.round(r.top));
      lines = tops.size || 2;
    }
    title.classList.toggle("is-oneline", lines === 1);
    title.style.fontSize = "";
    if (lines === 1) {
      const cs = getComputedStyle(title);
      const avail = stage.clientWidth - parseFloat(cs.left) - parseFloat(cs.right);
      const w = title.scrollWidth;
      if (w > avail && w > 0) title.style.fontSize = Math.floor((parseFloat(cs.fontSize) * avail) / w) + "px";
    }
  }

  function netZ(y) {
    // depth of the back net at height y (slanted: deeper at the ground)
    return -(NET_TOP + (1 - clamp(y / GOAL_H, 0, 1)) * (NET_BOTTOM - NET_TOP));
  }

  /* -------------------------------------------------------------- layout */
  function fitStage() {
    // the stage fills the first screen: everything under the header + ticker
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const h = Math.max(420, window.innerHeight - top);
    stage.style.height = h + "px";
  }

  let lastW = 0;
  function resize(force) {
    if (force || window.innerWidth !== lastW) {
      lastW = window.innerWidth;
      fitStage();
    }
    syncTitleLines();
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const aspect = w / h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.fov = aspect < 0.8 ? 68 : aspect < 1.3 ? 56 : 46;
    camRest.pos.z = aspect < 0.8 ? 6.3 : 6.2;
    camera.updateProjectionMatrix();
    if (ads) placeAds(ads);
    if (state === "done") {
      const spot = pageSpot();
      placePageBall(spot.cx, spot.cy, spot.r, spot.r);
      renderPage();
    }
  }

  function screenPos(world) {
    tmp.copy(world).project(camera);
    return { x: (tmp.x + 1) * 0.5 * stage.clientWidth, y: (1 - tmp.y) * 0.5 * stage.clientHeight };
  }

  function screenRadius(world) {
    const dist = world.distanceTo(camera.position);
    return (BALL_R / dist) * (stage.clientHeight / 2 / Math.tan((camera.fov * Math.PI) / 360));
  }

  function rollEnd() {
    // where the ball stops rolling in the 3D scene, before it leaves the stage
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const portrait = w / h < 0.9;
    const sx = portrait ? 0.62 : 0.6;
    const sy = portrait ? 0.8 : 0.84;
    raycaster.setFromCamera(new THREE.Vector2(sx * 2 - 1, -(sy * 2 - 1)), camera);
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    if (d.y >= -0.02) return new THREE.Vector3(0.8, BALL_R, 3.8);
    const t = (BALL_R - o.y) / d.y;
    const p = o.clone().addScaledVector(d, t);
    p.z = Math.min(p.z, camera.position.z - 1.3);
    p.x = clamp(p.x, -2.5, 2.5);
    return p;
  }

  /* Where the page scroll ends: the hero at the top of the screen, right
   * under the sticky header. Without a hero the ball is simply kept in view. */
  function pageScrollEnd(spot) {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const hero = document.querySelector(".hero");
    if (!hero) return clamp(spot.cy - window.innerHeight * 0.5, 0, max);
    let headH = 0;
    for (const el of document.querySelectorAll("header, .site-header, .header")) {
      const pos = getComputedStyle(el).position;
      if (pos === "sticky" || pos === "fixed") {
        headH = el.getBoundingClientRect().height;
        break;
      }
    }
    return clamp(hero.getBoundingClientRect().top + window.scrollY - headH, 0, max);
  }

  /* Where the ball rests at the end: next to the first line of the hero
   * title, in the free space before the photo (page coordinates, px). */
  function pageSpot() {
    const h1 = document.querySelector(".hero__title");
    const copy = document.querySelector(".hero__copy");
    const sy = window.scrollY;
    const sx = window.scrollX;
    if (h1 && copy && h1.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(h1);
      const rects = range.getClientRects();
      if (rects.length) {
        // first line box: the h1 box divided by the number of lines
        const box = h1.getBoundingClientRect();
        const lineH = box.height / rects.length;
        const line = { top: box.top, right: rects[0].right, height: lineH };
        const cs = getComputedStyle(copy);
        const right = copy.getBoundingClientRect().right - parseFloat(cs.paddingRight);
        const free = right - line.right;
        let r = Math.min(line.height * 0.58, free / 2 - 10);
        if (r >= 25) {
          r = clamp(r, 25, 160);
          // narrow screens: centred on the line, so the kicker above stays clear
          const lift = free < 260 ? 0.5 : 0.12;
          return { cx: line.right + free / 2 + sx, cy: line.top + line.height * lift + sy, r };
        }
        // no room next to the line: sit above it, at the right edge
        r = clamp(line.height * 0.55, 30, 170);
        return { cx: right - r - 8 + sx, cy: line.top - r - 12 + sy, r };
      }
    }
    // no hero: bottom right of the stage
    const s = stage.getBoundingClientRect();
    const r = clamp(s.height * 0.09, 40, 140);
    return { cx: s.left + s.width * 0.86 + sx, cy: s.top + s.height * 0.84 + sy, r };
  }

  /* ----------------------------------------------------------- page ball */
  const pageCanvas = document.createElement("canvas");
  pageCanvas.className = "intro__pageball";
  intro.appendChild(pageCanvas);
  let page2 = null;
  let pageSize = 0; // css size of the canvas (square)
  let pageRMax = 1;

  function ensurePageBall() {
    if (page2) return page2;
    const r = new THREE.WebGLRenderer({ canvas: pageCanvas, antialias: true, alpha: true });
    r.setClearColor(0x000000, 0);
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0xb9b7b0, 1.25));
    const k = new THREE.DirectionalLight(0xffffff, 2.2);
    k.position.set(-3, 5, 6);
    sc.add(k);
    const f = new THREE.DirectionalLight(0xffffff, 0.5);
    f.position.set(4, 2, 3);
    sc.add(f);
    const cam = new THREE.PerspectiveCamera(PAGE_FOV, 1, 0.05, 20);
    // distance so that the ball's outline fills 1/PAGE_PAD of the half canvas
    const half = Math.atan(Math.tan((PAGE_FOV * Math.PI) / 360) / PAGE_PAD);
    cam.position.set(0, 0, BALL_R / Math.sin(half));
    cam.lookAt(0, 0, 0);
    const pivot = new THREE.Group();
    sc.add(pivot);
    page2 = { renderer: r, scene: sc, camera: cam, pivot };
    return page2;
  }

  function placePageBall(cx, cy, r, rMax) {
    const p = ensurePageBall();
    const size = Math.ceil(2 * rMax * PAGE_PAD);
    if (size !== pageSize) {
      pageSize = size;
      pageRMax = rMax;
      p.renderer.setSize(size, size, false);
      pageCanvas.style.width = size + "px";
      pageCanvas.style.height = size + "px";
    }
    const rect = intro.getBoundingClientRect();
    const left = cx - rect.left - window.scrollX - size / 2;
    const top = cy - rect.top - window.scrollY - size / 2;
    pageCanvas.style.transform = "translate(" + left.toFixed(1) + "px," + top.toFixed(1) + "px) scale(" + (r / pageRMax).toFixed(4) + ")";
  }

  function renderPage() {
    if (page2) page2.renderer.render(page2.scene, page2.camera);
  }

  function moveBallToPage() {
    const p = ensurePageBall();
    if (ballMesh.parent !== p.pivot) {
      ball.remove(ballMesh);
      p.pivot.add(ballMesh);
    }
    intro.classList.add("has-pageball");
  }

  function moveBallToStage() {
    if (ballMesh.parent !== ball) {
      if (ballMesh.parent) ballMesh.parent.remove(ballMesh);
      ball.add(ballMesh);
    }
    shadowProxy.visible = false;
    intro.classList.remove("has-pageball");
  }

  /* The rolling ball (3D position on the stage) drawn by the page canvas, so
   * it stays in front of the title. */
  function placeRollBall(rMax) {
    const sp = screenPos(ball.position);
    const s = stage.getBoundingClientRect();
    placePageBall(sp.x + s.left + window.scrollX, sp.y + s.top + window.scrollY, screenRadius(ball.position), rMax);
  }

  /* ----------------------------------------------------------------- aim */
  function ballScreen() {
    return screenPos(ball.position);
  }

  function showAim(dir, power) {
    if (!aim || !aimLine || !aimHead) return;
    const b = ballScreen();
    const len = 44 + 120 * power;
    const x2 = b.x + dir.x * len;
    const y2 = b.y + dir.y * len;
    const x1 = b.x + dir.x * 26;
    const y1 = b.y + dir.y * 26;
    aimLine.setAttribute("x1", x1.toFixed(1));
    aimLine.setAttribute("y1", y1.toFixed(1));
    aimLine.setAttribute("x2", x2.toFixed(1));
    aimLine.setAttribute("y2", y2.toFixed(1));
    const nx = -dir.y;
    const ny = dir.x;
    const s = 7;
    aimHead.setAttribute(
      "points",
      [
        (x2 + dir.x * 12).toFixed(1) + "," + (y2 + dir.y * 12).toFixed(1),
        (x2 + nx * s).toFixed(1) + "," + (y2 + ny * s).toFixed(1),
        (x2 - nx * s).toFixed(1) + "," + (y2 - ny * s).toFixed(1),
      ].join(" ")
    );
    aim.classList.add("is-on");
  }

  function hideAim() {
    if (aim) aim.classList.remove("is-on");
  }

  function mouseAim() {
    if (!pointer) return null;
    const b = ballScreen();
    const dx = pointer.x - b.x;
    const dy = pointer.y - b.y;
    const len = Math.hypot(dx, dy);
    if (len < 4) return { x: 0, y: -1, power: 0.7 };
    return { x: dx / len, y: dy / len, power: clamp(len / 300, 0.3, 1) };
  }

  function local(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  stage.addEventListener("pointermove", (e) => {
    if (state !== "aim") return;
    pointer = local(e);
    if (drag) {
      drag.x = pointer.x;
      drag.y = pointer.y;
      const dx = drag.x - drag.x0;
      const dy = drag.y - drag.y0;
      const len = Math.hypot(dx, dy);
      if (len > 6) showAim({ x: dx / len, y: dy / len }, clamp(len / 220, 0.3, 1));
    } else if (e.pointerType === "mouse") {
      const a = mouseAim();
      if (a) showAim(a, a.power);
    }
  });

  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (state !== "aim") return;
    const p = local(e);
    pointer = p;
    if (e.pointerType === "mouse") {
      throwBall(mouseAim() || { x: 0, y: -1, power: 0.7 });
      return;
    }
    drag = { x0: p.x, y0: p.y, x: p.x, y: p.y };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
  });

  stage.addEventListener("pointerup", (e) => {
    if (!drag || state !== "aim") return;
    const dx = drag.x - drag.x0;
    const dy = drag.y - drag.y0;
    const len = Math.hypot(dx, dy);
    drag = null;
    if (len < 10) throwBall({ x: 0, y: -1, power: 0.7 });
    else throwBall({ x: dx / len, y: dy / len, power: clamp(len / 220, 0.3, 1) });
  });

  stage.addEventListener("pointercancel", () => {
    drag = null;
    hideAim();
  });

  stage.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") {
      pointer = null;
      hideAim();
    }
  });

  // the resting ball: click / tap to play again
  pageCanvas.addEventListener("click", () => {
    if (state === "done") reset();
  });

  // Scrolling before the throw: skip to the end, as if the ball had been thrown.
  window.addEventListener(
    "scroll",
    () => {
      if (state === "aim" && window.scrollY > 24 && performance.now() > ignoreScrollUntil) finish(true);
    },
    { passive: true }
  );
  // The visitor takes over scrolling: stop following the ball.
  const stopFollow = () => {
    follow = false;
  };
  window.addEventListener("wheel", stopFollow, { passive: true });
  window.addEventListener("touchmove", stopFollow, { passive: true });
  window.addEventListener("keydown", stopFollow);

  /* --------------------------------------------------------------- throw */
  /* Ads hang on the wall behind the goal. A camera ray through the goal
   * mouth (or the posts) is always a goal shot — even if it would later
   * hit a board. A board is only targeted if the aim misses the mouth
   * and actually hits that board. */
  function aimNDC(d) {
    let x;
    let y;
    if (pointer) {
      x = pointer.x;
      y = pointer.y;
    } else {
      const b = ballScreen();
      x = b.x + d.x * 220;
      y = b.y + d.y * 220;
    }
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    return new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
  }

  function rayThroughGoal(ray) {
    if (Math.abs(ray.direction.z) < 1e-6) return false;
    const t = (0 - ray.origin.z) / ray.direction.z;
    if (t < 0.05) return false;
    const x = ray.origin.x + ray.direction.x * t;
    const y = ray.origin.y + ray.direction.y * t;
    const pad = 0.18;
    return Math.abs(x) <= GOAL_W / 2 + POST + pad && y >= -pad && y <= GOAL_H + POST + pad;
  }

  function aimedAd(d) {
    if (!ads) return null;
    raycaster.setFromCamera(aimNDC(d), camera);
    if (rayThroughGoal(raycaster.ray)) return null;
    const hitL = raycaster.intersectObject(ads.left.object, true);
    const hitR = raycaster.intersectObject(ads.right.object, true);
    const tL = hitL.length ? hitL[0].distance : Infinity;
    const tR = hitR.length ? hitR[0].distance : Infinity;
    if (tL === Infinity && tR === Infinity) return null;
    return tL < tR ? ads.left : ads.right;
  }

  function touchingAd(ad) {
    ad.object.updateMatrixWorld(true);
    tmp.copy(ball.position);
    ad.object.worldToLocal(tmp);
    const hx = AD_W / 2 + BALL_R;
    const hy = AD_H / 2 + BALL_R;
    const hz = AD_D / 2 + BALL_R;
    return Math.abs(tmp.x) <= hx && Math.abs(tmp.y) <= hy && Math.abs(tmp.z) <= hz + 0.06;
  }

  function throwBall(d) {
    if (state !== "aim") return;
    const ax = d.x;
    const ay = -d.y; // up is positive
    const power = d.power;
    const aimed = aimedAd(d);
    const P0 = ball.position.clone();
    const reach = 1.3 + 1.3 * power;
    let P3;
    let kind = "goal";
    if (aimed) {
      kind = "ad";
      P3 = aimed.hitPoint(ay);
    } else {
      const halfInner = GOAL_W / 2 - BALL_R - 0.18;
      const tx = clamp(ax * 1.4, -1, 1) * halfInner + (Math.random() - 0.5) * 0.12;
      const tyN = clamp(0.5 + ay * 0.62, 0.05, 0.94);
      const ty = BALL_R + 0.03 + tyN * (GOAL_H - 2 * BALL_R - 0.1);
      P3 = new THREE.Vector3(tx, ty, netZ(ty) + BALL_R * 0.55);
    }
    const P1 = P0.clone().add(new THREE.Vector3(ax * reach, Math.max(ay, -0.3) * reach + 0.35, -reach * 0.8));
    const P2 = P3.clone().add(new THREE.Vector3(kind === "ad" ? ax * 0.2 : -ax * 0.4, 0.45 + Math.max(ay, 0) * 0.45, kind === "ad" ? 0.9 : 2.2));
    flight = { P0, P1, P2, P3, t: 0, dur: 0.85 + 0.35 * (1 - power), kind, ad: aimed };
    state = "flight";
    intro.classList.remove("is-aiming");
    hideAim();
    setHint("");
    camTarget.copy(camRest.pos);
  }

  function bezier(f, t, out) {
    const u = 1 - t;
    out.set(0, 0, 0);
    out.addScaledVector(f.P0, u * u * u);
    out.addScaledVector(f.P1, 3 * u * u * t);
    out.addScaledVector(f.P2, 3 * u * t * t);
    out.addScaledVector(f.P3, t * t * t);
    return out;
  }

  function spinBy(delta) {
    const dist = delta.length();
    if (dist < 1e-5) return;
    tmp2.crossVectors(UP, delta).normalize();
    ballMesh.rotateOnWorldAxis(tmp2, dist / BALL_R);
  }

  function showTitle() {
    if (title) {
      title.classList.remove("is-out");
      title.classList.add("is-in");
    }
  }

  function impact() {
    const f = flight;
    const vel = f.P3.clone().sub(f.P2).multiplyScalar(3 / f.dur);
    const push = vel.clone().normalize();
    netHit = { impact: f.P3.clone(), push, t: 0 };
    drop = {
      v: new THREE.Vector3(vel.x * 0.15, 0.6, 1.0 + Math.abs(vel.z) * 0.06),
      bounces: 0,
      t: 0,
    };
    fromAd = false;
    flight = null;
    state = "drop";
    board && board.goal();
    showTitle();
  }

  function impactAd(ad) {
    const f = flight;
    const vel = f.P3.clone().sub(f.P2).multiplyScalar(3 / f.dur);
    const inward = ad.side < 0 ? 0.85 : -0.85;
    drop = {
      v: new THREE.Vector3(inward + vel.x * 0.08, 0.85, 1.35 + Math.abs(vel.z) * 0.05),
      bounces: 0,
      t: 0,
    };
    fromAd = true;
    ad.flash();
    askAdvertiser(ad);
    flight = null;
    state = "drop";
    showTitle();
  }

  function adHost(url) {
    try {
      return new URL(url, window.location.href).host.replace(/^www\./, "");
    } catch (e) {
      return url;
    }
  }

  function closeAdPrompt() {
    adPromptOpen = false;
    adPromptHref = "";
    if (adPrompt && adPrompt.open) adPrompt.close();
  }

  function askAdvertiser(ad) {
    const href = String((ad && ad.url) || "").trim();
    if (!href || !adPrompt) return;
    const host = adHost(href);
    const isIT = ad.style === "terminal" || /damianmoser\.ch/i.test(href);
    adPromptHref = href;
    if (adPromptAsk) adPromptAsk.textContent = "Wottsch " + host + " ufmache?";
    if (adPromptBlurb) {
      adPromptBlurb.textContent = isIT
        ? "damianmoser.ch isch de IT-Sponsor vo de Forti-Legends."
        : String(ad.label || "Werbung für d Forti-Legends.");
    }
    adPromptOpen = true;
    follow = false;
    if (adPrompt.open) adPrompt.close();
    if (typeof adPrompt.showModal === "function") adPrompt.showModal();
    else adPrompt.setAttribute("open", "");
  }

  if (adPromptGo) {
    adPromptGo.addEventListener("click", (e) => {
      e.preventDefault();
      const href = adPromptHref;
      closeAdPrompt();
      openAdvertiser(href);
    });
  }
  if (adPromptNo) {
    adPromptNo.addEventListener("click", (e) => {
      e.preventDefault();
      closeAdPrompt();
    });
  }
  if (adPrompt) {
    adPrompt.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeAdPrompt();
    });
  }

  function startRoll() {
    const p0 = ball.position.clone();
    const pf = rollEnd();
    const q = new THREE.Vector3(p0.x * 0.6, BALL_R, Math.max(1.8, p0.z + 1.2));
    const dist = p0.distanceTo(q) + q.distanceTo(pf);
    const sp = screenPos(p0);
    const rMax = Math.max(screenRadius(p0), screenRadius(q), screenRadius(pf));
    roll = { p0, q, pf, t: 0, dur: clamp(dist / 1.9, 1.6, 2.8), prev: p0.clone(), sx: sp.x, sy: sp.y, vx: 0, vy: 0, rMax };
    drop = null;
    state = "roll";
    // from here on the ball is drawn on the page canvas, above the title
    moveBallToPage();
    shadowProxy.visible = true;
    placeRollBall(rMax);
  }

  /* The ball leaves the 3D stage and rolls on down the page to the hero
   * title without stopping: the page phase starts at the speed the ball had
   * on screen and eases out. The page scroll and the title travel with the
   * same easing, so it is one motion. */
  function startPage() {
    const from = screenPos(ball.position);
    const r0 = screenRadius(ball.position);
    const s = stage.getBoundingClientRect();
    const cx0 = from.x + s.left + window.scrollX;
    const cy0 = from.y + s.top + window.scrollY;
    const to = pageSpot();
    moveBallToPage();
    shadowProxy.visible = false;
    placePageBall(cx0, cy0, r0, Math.max(r0, to.r));
    const scroll0 = window.scrollY;
    const scrollEnd = pageScrollEnd(to);
    const dist = Math.hypot(to.cx - cx0, to.cy - cy0);
    const v0 = roll ? Math.hypot(roll.vx, roll.vy) : 0; // px/s on screen at the handoff
    const dur = clamp((2 * dist) / Math.max(v0, 1), 1.7, 3.2);
    // the stage title travels to the hero title: same font, so a move + scale
    let morph = null;
    if (title && heroTitle && title.classList.contains("is-in")) {
      title.classList.add("is-moving");
      const A = title.getBoundingClientRect();
      const B = heroTitle.getBoundingClientRect();
      if (A.height > 0 && B.height > 0) morph = { dx: B.left - A.left, dy: B.top - A.top, k: B.height / A.height };
    }
    page = { cx0, cy0, r0, to, t: 0, dur, prevX: cx0, prevY: cy0, scroll0, scrollEnd, morph };
    follow = !adPromptOpen;
    roll = null;
    state = "page";
  }

  function done() {
    state = "done";
    page = null;
    intro.classList.add("is-done");
    // the stage title has arrived: from here on it is the hero title
    if (heroTitle) heroTitle.classList.remove("is-hidden");
    if (title) title.classList.add("is-gone");
    setHint(hints.done);
    setTimeout(() => {
      if (state === "done") setHint(hints.done + "   //   " + hints.again);
    }, 2500);
  }

  function finish(instant) {
    // end state right away (scroll before the throw, reduced motion)
    flight = drop = roll = page = null;
    netHit = null;
    fromAd = false;
    net && net.apply(null, null, 0);
    intro.classList.remove("is-aiming");
    hideAim();
    resetTitle();
    board && board.goal();
    const spot = pageSpot();
    moveBallToPage();
    ballMesh.quaternion.copy(frontQ);
    placePageBall(spot.cx, spot.cy, spot.r, spot.r);
    renderPage();
    done();
  }

  function reset() {
    moveBallToStage();
    ball.position.copy(START);
    ballMesh.rotation.set(0.3, 0.8, 0.1);
    netHit = null;
    fromAd = false;
    net && net.apply(null, null, 0);
    board && board.restart();
    ads && ads.restart();
    closeAdPrompt();
    resetTitle();
    ignoreScrollUntil = performance.now() + 1800;
    window.scrollTo({ top: 0, behavior: "smooth" });
    enterAim();
    run();
  }

  /* -------------------------------------------------------------- update */
  function update(dt) {
    // camera: tiny parallax while aiming (mouse on desktop, tilt on phone)
    if (state === "aim") {
      let nx = 0;
      let ny = 0;
      let looking = false;
      if (pointer && !coarse) {
        nx = (pointer.x / stage.clientWidth) * 2 - 1;
        ny = (pointer.y / stage.clientHeight) * 2 - 1;
        looking = true;
      } else if (gyroLook) {
        nx = gyroLook.x;
        ny = gyroLook.y;
        looking = true;
      }
      if (looking) camTarget.set(camRest.pos.x + nx * 0.3, camRest.pos.y - ny * 0.1, camRest.pos.z);
      else camTarget.copy(camRest.pos);
    } else {
      camTarget.copy(camRest.pos);
    }
    camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
    camera.lookAt(camRest.look);

    if (state === "aim") {
      // idle: the ball hovers in the hand and turns a little
      restT += dt;
      ball.position.y = START.y + Math.sin(restT * 1.8) * 0.03;
      ballMesh.rotation.y += dt * 0.25;
      return;
    }

    if (state === "flight" && flight) {
      flight.t += dt / flight.dur;
      const t = Math.min(1, flight.t);
      const prev = ball.position.clone();
      bezier(flight, t, ball.position);
      spinBy(tmp.copy(ball.position).sub(prev));
      if (flight.kind === "ad" && flight.ad && (touchingAd(flight.ad) || flight.t >= 1)) impactAd(flight.ad);
      else if (flight.t >= 1) impact();
    } else if (state === "drop" && drop) {
      const v = drop.v;
      drop.t += dt;
      v.y -= GRAVITY * dt;
      const prev = ball.position.clone();
      ball.position.addScaledVector(v, dt);
      const p = ball.position;
      if (p.y < BALL_R) {
        p.y = BALL_R;
        v.y = -v.y * 0.42;
        v.x *= 0.75;
        v.z *= 0.75;
        drop.bounces++;
      }
      if (!fromAd) {
        const minZ = netZ(p.y) + BALL_R;
        if (p.z < minZ) {
          p.z = minZ;
          v.z = Math.abs(v.z) * 0.4;
        }
        const maxX = GOAL_W / 2 - BALL_R - 0.05;
        if (Math.abs(p.x) > maxX) {
          p.x = Math.sign(p.x) * maxX;
          v.x = -v.x * 0.4;
        }
      }
      spinBy(tmp.copy(p).sub(prev));
      if ((drop.bounces >= 2 && Math.abs(v.y) < 1.4 && p.y <= BALL_R + 0.01) || drop.t > 1.8) startRoll();
    } else if (state === "roll" && roll) {
      roll.t += dt / roll.dur;
      const t = Math.min(1, roll.t);
      const s = t * (0.55 + 0.45 * t); // gets going, never stops
      const u = 1 - s;
      const p = ball.position;
      p.set(0, 0, 0);
      p.addScaledVector(roll.p0, u * u);
      p.addScaledVector(roll.q, 2 * u * s);
      p.addScaledVector(roll.pf, s * s);
      p.y = BALL_R;
      spinBy(tmp.copy(p).sub(roll.prev));
      roll.prev.copy(p);
      if (dt > 0) {
        const sp = screenPos(p);
        roll.vx = lerp(roll.vx, (sp.x - roll.sx) / dt, 0.5);
        roll.vy = lerp(roll.vy, (sp.y - roll.sy) / dt, 0.5);
        roll.sx = sp.x;
        roll.sy = sp.y;
      }
      placeRollBall(roll.rMax);
      if (roll.t >= 1) startPage();
    } else if (state === "page" && page) {
      page.t += dt / page.dur;
      const t = Math.min(1, page.t);
      const s = 1 - (1 - t) * (1 - t); // full speed from the handoff, eases out
      const cx = lerp(page.cx0, page.to.cx, s);
      const cy = lerp(page.cy0, page.to.cy, s);
      const r = lerp(page.r0, page.to.r, s);
      // rolling on the page: turn around the axis across the movement
      const dx = cx - page.prevX;
      const dy = cy - page.prevY;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        tmp2.set(dy, dx, 0).normalize();
        ballMesh.rotateOnWorldAxis(tmp2, d / r);
      }
      // settle with the logo to the front
      if (s > 0.5) ballMesh.quaternion.slerp(frontQ, Math.pow((s - 0.5) / 0.5, 2) * 0.35);
      if (t >= 1) ballMesh.quaternion.copy(frontQ);
      page.prevX = cx;
      page.prevY = cy;
      placePageBall(cx, cy, r, pageRMax);
      if (follow) {
        // the page scrolls along with the same easing: one motion
        const want = lerp(page.scroll0, page.scrollEnd, s);
        if (Math.abs(want - window.scrollY) > 0.5) window.scrollTo({ top: want, behavior: "instant" });
      }
      if (page.morph) {
        const m = page.morph;
        title.style.transform =
          "translate3d(" + (m.dx * s).toFixed(1) + "px," + (m.dy * s).toFixed(1) + "px,0) scale(" + lerp(1, m.k, s).toFixed(4) + ")";
      }
      if (t >= 1) done();
    }

    if (netHit && net) {
      netHit.t += dt;
      const t = netHit.t;
      let amp;
      if (t < 0.1) amp = t / 0.1;
      else amp = Math.exp(-(t - 0.1) * 2.6) * Math.cos((t - 0.1) * 9);
      net.apply(netHit.impact, netHit.push, amp * 0.5);
      if (t > 2.6) {
        net.apply(null, null, 0);
        netHit = null;
      }
    }
  }

  /* ---------------------------------------------------------------- loop */
  let last = performance.now();
  let running = false;
  let visible = true;

  function frame(now) {
    if (!visible && state !== "page") {
      running = false;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (visible && board) board.tick(now);
    if (visible && ads) ads.tick(now);
    if (visible) renderer.render(scene, camera);
    if (state === "roll" || state === "page" || state === "done") renderPage();
    requestAnimationFrame(frame);
  }

  function run() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) run();
      },
      { threshold: 0.01 }
    ).observe(stage);
  }

  window.addEventListener("resize", () => resize(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncTitleLines);
  window.addEventListener("orientationchange", () => {
    gyroOrigin = null;
    setTimeout(() => resize(true), 250);
  });
  resize(true);
  if (reduce) finish(true);
  else enterAim();
  run();
}

/* ============================================================ built-ins */

function buildBall() {
  const tex = ballTexture();
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex.texture,
    bumpMap: tex.bump,
    bumpScale: 0.8,
    roughness: 0.45,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.35,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 72, 48), mat);
  mesh.castShadow = true;
  // orientation that shows the wordmark to the front (+z), upright
  const m = new THREE.Matrix4().makeBasis(tex.e1, tex.e2, tex.front).transpose();
  const front = new THREE.Quaternion().setFromRotationMatrix(m);
  return { mesh, front };
}

/* Handball look-alike (Kempa Leo style): navy pentagons and red hexagons
 * (one navy hexagon carries the white wordmark), thin white speed lines with
 * grey bands sweeping around two sides of the ball, dark seams and a dimpled
 * surface in the bump map. Directions follow three.js's SphereGeometry
 * mapping so we know where the wordmark sits. Returns the colour and bump
 * textures and the tangent basis of the wordmark. */
function ballTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const bc = document.createElement("canvas");
  bc.width = W;
  bc.height = H;
  const bctx = bc.getContext("2d");
  const bimg = bctx.createImageData(W, H);
  const bd = bimg.data;
  const t = (1 + Math.sqrt(5)) / 2;
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const V = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(norm);
  const F = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const G = V.concat(
    F.map((f) => norm([
      V[f[0]][0] + V[f[1]][0] + V[f[2]][0],
      V[f[0]][1] + V[f[1]][1] + V[f[2]][1],
      V[f[0]][2] + V[f[1]][2] + V[f[2]][2],
    ]))
  );
  const n = G.length;
  const gx = new Float32Array(n), gy = new Float32Array(n), gz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gx[i] = G[i][0];
    gy[i] = G[i][1];
    gz[i] = G[i][2];
  }

  // wordmark on hexagon LOGO: tangent basis e1 (right), e2 (up) around its centre
  const LOGO = 12 + 15; // a face centre
  const front = v3(G[LOGO]);
  const e2 = new THREE.Vector3(0, 1, 0).addScaledVector(front, -front.y).normalize();
  const e1 = new THREE.Vector3().crossVectors(e2, front).normalize();
  const LS = 256;
  const lc = document.createElement("canvas");
  lc.width = LS;
  lc.height = LS;
  const lctx = lc.getContext("2d");
  lctx.fillStyle = "#fff";
  lctx.textAlign = "center";
  lctx.textBaseline = "middle";
  lctx.font = "900 46px Inter, 'Arial Black', Arial, sans-serif";
  lctx.fillText("FORTI-", LS / 2, LS / 2 - 27);
  lctx.fillText("LEGENDS", LS / 2, LS / 2 + 25);
  lctx.fillRect(LS / 2 - 42, LS / 2 + 64, 84, 6);
  const logo = lctx.getImageData(0, 0, LS, LS).data;
  const EXT = 0.27; // half size of the wordmark in tangent units

  // speed lines: bands around the axis N, only along two opposite arcs
  const N = new THREE.Vector3(0.35, 1, 0.25).normalize();
  const U = new THREE.Vector3().crossVectors(N, new THREE.Vector3(1, 0, 0)).normalize();
  const Wv = new THREE.Vector3().crossVectors(N, U);
  const NAVY = [30, 42, 94];
  const REDC = [228, 44, 56];
  const SEAM = [14, 18, 40];
  const GREY = [160, 164, 178];
  const WHT = [246, 246, 250];

  let k = 0;
  for (let y = 0; y < H; y++) {
    const theta = (y / H) * Math.PI;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    for (let x = 0; x < W; x++) {
      const phi = (x / W) * Math.PI * 2;
      const px = -Math.cos(phi) * st;
      const py = ct;
      const pz = Math.sin(phi) * st;
      let best = -2, second = -2, bi = 0;
      for (let i = 0; i < n; i++) {
        const dot = px * gx[i] + py * gy[i] + pz * gz[i] + (i < 12 ? -0.012 : 0);
        if (dot > best) {
          second = best;
          best = dot;
          bi = i;
        } else if (dot > second) second = dot;
      }
      const a1 = Math.acos(clamp(best, -1, 1));
      const a2 = Math.acos(clamp(second, -1, 1));
      const seam = a2 - a1 < 0.028;
      const col = seam ? SEAM : bi < 12 || bi === LOGO ? NAVY : REDC;
      let grey = 0;
      let white = false;
      let print = false;
      if (!seam && bi >= 12 && bi !== LOGO) {
        const dd = px * N.x + py * N.y + pz * N.z;
        const az = Math.atan2(px * U.x + py * U.y + pz * U.z, px * Wv.x + py * Wv.y + pz * Wv.z);
        const e = Math.min(Math.abs(az), Math.PI - Math.abs(az));
        const strength = clamp(1 - e / 1.3, 0, 1); // the lines taper out at both ends
        if (strength > 0) {
          const wl = 0.0095 * (0.35 + 0.65 * strength);
          const wg = 0.032 * strength;
          if (Math.abs(dd - 0.005) < wg || Math.abs(dd - 0.215) < wg * 0.8) grey = 0.9;
          if (Math.abs(dd - 0.1) < wl || Math.abs(dd - 0.15) < wl * 0.8 || Math.abs(dd + 0.06) < wl * 0.7) white = true;
        }
      } else if (!seam && bi === LOGO) {
        const u = px * e1.x + py * e1.y + pz * e1.z;
        const w = px * e2.x + py * e2.y + pz * e2.z;
        if (Math.abs(u) < EXT && Math.abs(w) < EXT) {
          const lx = Math.floor(((u / EXT + 1) / 2) * (LS - 1));
          const ly = Math.floor(((1 - w / EXT) / 2) * (LS - 1));
          if (logo[(ly * LS + lx) * 4 + 3] > 100) print = true;
        }
      }
      let r = col[0], g = col[1], b = col[2];
      if (grey) {
        r = lerp(r, GREY[0], grey);
        g = lerp(g, GREY[1], grey);
        b = lerp(b, GREY[2], grey);
      }
      if (white || print) {
        r = WHT[0];
        g = WHT[1];
        b = WHT[2];
      }
      const nz = (Math.random() - 0.5) * 10;
      d[k] = clamp(r + nz, 0, 255);
      d[k + 1] = clamp(g + nz, 0, 255);
      d[k + 2] = clamp(b + nz, 0, 255);
      d[k + 3] = 255;
      // bump: seams are grooves, the surface is dimpled, the print is flat
      let bv = 128;
      if (seam) bv = 40;
      else if (!print) bv = 128 + 30 * Math.sin(x * 0.85) * Math.sin(y * 0.85);
      bd[k] = bv;
      bd[k + 1] = bv;
      bd[k + 2] = bv;
      bd[k + 3] = 255;
      k += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bc);
  bump.anisotropy = 4;
  return { texture, bump, front, e1, e2 };
}

let edgeMat = null;

function outline(mesh, angle) {
  if (!edgeMat) edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.9 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle || 25), edgeMat);
  mesh.add(edges);
}

/* Cartoon goal: chunky striped posts (red / white with black outlines), a
 * thin red back frame and a net made of lines that can be pushed by the ball. */
function buildGoal() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5, metalness: 0 });
  const white = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.5, metalness: 0 });
  const frame = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.6, metalness: 0 });

  function bar(len, axis, at, startRed) {
    const n = Math.max(1, Math.round(len / 0.36));
    const seg = len / n;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BoxGeometry(axis === "x" ? seg : POST, axis === "y" ? seg : POST, POST);
      const m = new THREE.Mesh(geo, (i % 2 === 0) === startRed ? red : white);
      m.position.set(at.x, at.y, at.z);
      const off = -len / 2 + seg * (i + 0.5);
      if (axis === "x") m.position.x += off;
      else m.position.y += off;
      m.castShadow = true;
      m.receiveShadow = true;
      outline(m);
      g.add(m);
    }
  }

  const px = GOAL_W / 2 + POST / 2;
  bar(GOAL_H + POST, "y", { x: -px, y: (GOAL_H + POST) / 2, z: 0 }, true);
  bar(GOAL_H + POST, "y", { x: px, y: (GOAL_H + POST) / 2, z: 0 }, true);
  bar(GOAL_W + 2 * POST, "x", { x: 0, y: GOAL_H + POST / 2, z: 0 }, false);

  function tube(a, b, r) {
    const A = v3(a), B = v3(b);
    const len = A.distanceTo(B);
    const geo = new THREE.CylinderGeometry(r, r, len, 10);
    const m = new THREE.Mesh(geo, frame);
    m.position.copy(A).lerp(B, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    m.castShadow = true;
    g.add(m);
  }
  const R = 0.035;
  for (const s of [-1, 1]) {
    const x = s * px;
    tube([x, R, 0], [x, R, -NET_BOTTOM], R); // ground bar
    tube([x, GOAL_H + POST / 2, 0], [x, GOAL_H, -NET_TOP], R); // top support
    tube([x, GOAL_H, -NET_TOP], [x, R, -NET_BOTTOM], R); // back diagonal
  }
  tube([-px, R, -NET_BOTTOM], [px, R, -NET_BOTTOM], R); // back ground bar
  tube([-px, GOAL_H, -NET_TOP], [px, GOAL_H, -NET_TOP], R); // back top bar

  const net = buildNet();
  g.add(net.object);
  g.userData.net = net;
  return g;
}

function buildNet() {
  const hw = GOAL_W / 2;
  const panels = [
    [[-hw, GOAL_H, -NET_TOP], [hw, GOAL_H, -NET_TOP], [hw, 0, -NET_BOTTOM], [-hw, 0, -NET_BOTTOM]], // back
    [[-hw, GOAL_H, 0], [hw, GOAL_H, 0], [hw, GOAL_H, -NET_TOP], [-hw, GOAL_H, -NET_TOP]], // top
    [[-hw, GOAL_H, 0], [-hw, GOAL_H, -NET_TOP], [-hw, 0, -NET_BOTTOM], [-hw, 0, 0]], // left
    [[hw, GOAL_H, 0], [hw, GOAL_H, -NET_TOP], [hw, 0, -NET_BOTTOM], [hw, 0, 0]], // right
  ];
  const MESH = 0.11;
  const pts = [];
  for (const [a, b, c, d] of panels) {
    const A = v3(a), B = v3(b), C = v3(c), D = v3(d);
    const nu = Math.max(2, Math.round(A.distanceTo(B) / MESH));
    const nv = Math.max(2, Math.round(A.distanceTo(D) / MESH));
    const grid = [];
    for (let j = 0; j <= nv; j++) {
      const l = A.clone().lerp(D, j / nv);
      const r = B.clone().lerp(C, j / nv);
      const row = [];
      for (let i = 0; i <= nu; i++) row.push(l.clone().lerp(r, i / nu));
      grid.push(row);
    }
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        if (i < nu) pts.push(grid[j][i], grid[j][i + 1]);
        if (j < nv) pts.push(grid[j][i], grid[j + 1][i]);
      }
    }
  }
  const base = new Float32Array(pts.length * 3);
  pts.forEach((p, k) => {
    base[k * 3] = p.x;
    base[k * 3 + 1] = p.y;
    base[k * 3 + 2] = p.z;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
  const mat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });
  const lines = new THREE.LineSegments(geo, mat);
  return makeDeformer(lines, base, null);
}

/* Net deformer: pushes vertices near the impact point, less so near the
 * frame (posts, crossbar, ground) where the net is tied. Works for the
 * built-in line net and for a mesh from a loaded model. */
function makeDeformer(object, base, matrixWorld) {
  const attr = object.geometry.attributes.position;
  const count = base.length / 3;
  const free = new Float32Array(count);
  const hw = GOAL_W / 2;
  for (let k = 0; k < count; k++) {
    const x = base[k * 3], y = base[k * 3 + 1], z = base[k * 3 + 2];
    const dPost = Math.hypot(Math.abs(x) - hw, z);
    const dBar = Math.hypot(y - GOAL_H, z);
    free[k] = clamp(Math.min(dPost, dBar, y) / 0.4, 0, 1);
  }
  const inv = matrixWorld ? matrixWorld.clone().invert() : null;
  const p = new THREE.Vector3();
  const s2 = 2 * 0.55 * 0.55;
  return {
    object,
    apply(impact, push, amp) {
      const arr = attr.array;
      for (let k = 0; k < count; k++) {
        const bx = base[k * 3], by = base[k * 3 + 1], bz = base[k * 3 + 2];
        let x = bx, y = by, z = bz;
        if (amp && impact) {
          const dx = bx - impact.x, dy = by - impact.y, dz = bz - impact.z;
          const w = amp * free[k] * Math.exp(-(dx * dx + dy * dy + dz * dz) / s2);
          x += push.x * w;
          y += push.y * w;
          z += push.z * w;
        }
        if (inv) {
          p.set(x, y, z).applyMatrix4(inv);
          x = p.x;
          y = p.y;
          z = p.z;
        }
        arr[k * 3] = x;
        arr[k * 3 + 1] = y;
        arr[k * 3 + 2] = z;
      }
      attr.needsUpdate = true;
    },
  };
}

/* ========================================================== scoreboard */

/* Front matter -> board settings (see modules/intro.html for the defaults). */
function boardConfig(ds) {
  const mmss = (str, fallback) => {
    const m = /^(\d+):(\d{1,2})$/.exec(String(str || "").trim());
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : fallback;
  };
  const sc = /^(\d+)\s*[:\-]\s*(\d+)$/.exec(String(ds.score || "").trim());
  return {
    home: ds.home || "Forti",
    guest: ds.guest || "Gast",
    score: sc ? [parseInt(sc[1], 10), parseInt(sc[2], 10)] : [64, 5],
    period: parseInt(ds.period, 10) || 2,
    clock: mmss(ds.clock, 29 * 60 + 24),
    penalty: mmss(ds.penalty, 69),
    penaltyNumber: parseInt(ds.penaltyNumber, 10) || 3,
  };
}

/* Front matter -> advertising boards (see modules/intro.html). */
function adsConfig(ds) {
  return {
    left: {
      label: ds.adLeftLabel || "IT Sponsoring",
      url: ds.adLeftUrl || "https://damianmoser.ch/",
      style: ds.adLeftStyle || "terminal",
    },
    right: {
      label: ds.adRightLabel || "Hier könnte ihre Werbung stehen",
      url: ds.adRightUrl || "",
      style: ds.adRightStyle || "sale",
    },
  };
}

function openAdvertiser(url) {
  const href = String(url || "").trim();
  if (!href) return;
  try {
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (w) w.opener = null;
  } catch (e) {
    /* popup blocked */
  }
}

/* A hall scoreboard hanging above the goal: a black box with a canvas
 * texture that shows LED-dot digits. tick() redraws it once a second (only
 * when a shown value changes), goal() adds a point, restart() resets it. The
 * penalty timer runs with the game clock and stops with it. */
function buildBoard(cfg) {
  const W = 1024;
  const H = 768;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const object = new THREE.Group();
  const bottom = GOAL_H + POST + BOARD_LIFT;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.1, BOARD_H + 0.1, 0.12), dark);
  body.position.set(0, bottom + BOARD_H / 2, BOARD_Z);
  body.castShadow = true;
  outline(body);
  object.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.set(0, bottom + BOARD_H / 2, BOARD_Z + 0.061);
  object.add(face);

  const RED_LED = "#ff2a2a";
  const GREEN_LED = "#39ff5a";
  const YELLOW_LED = "#ffd23a";
  const WHITE_LED = "#f4f4f4";
  const cap = cfg.clock <= 30 * 60 ? 30 * 60 : 60 * 60; // end of the half
  let t0 = performance.now();
  let score = cfg.score.slice();
  let lastKey = "";
  const two = (n) => (n < 10 ? "0" + n : "" + n);
  const fmt = (sec, padMin) => {
    const m = Math.floor(sec / 60);
    return (padMin ? two(m) : "" + m) + ":" + two(sec % 60);
  };

  function draw(clockStr, penStr) {
    ctx.clearRect(0, 0, W, H);
    // box with a soft edge and screws
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = "#4a4a4a";
    for (const [x, y] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26], [26, 463], [W - 26, 463]]) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // two panels: game (top) and penalties (bottom)
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(0, 456, W, 14);
    // the plates of the real board are filled in the board's own black
    ctx.fillStyle = "#0b0b0b";
    for (const [x, y, w, h] of [[28, 292, 221, 140], [775, 292, 221, 140], [21, 641, 434, 102], [548, 501, 441, 242]]) {
      ctx.fillRect(x, y, w, h);
    }

    // score, period, team names
    ledText(ctx, "" + score[0], 348, 30, 135, RED_LED, "right");
    ledText(ctx, "" + score[1], 676, 30, 135, RED_LED, "left");
    ledText(ctx, "" + cfg.period, 512, 62, 84, GREEN_LED, "center");
    ctx.fillStyle = WHITE_LED;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "800 78px Inter, 'Arial Black', Arial, sans-serif";
    ctx.fillText(cfg.home.toUpperCase(), 189, 214);
    ctx.fillText(cfg.guest.toUpperCase(), 828, 214);
    // game clock
    ledText(ctx, clockStr, 512, 300, 130, WHITE_LED, "center");
    ctx.font = "700 20px Inter, Arial, sans-serif";
    ctx.fillStyle = "#cfcfcf";
    ctx.fillText("FORTI-LEGENDS", 512, 446);
    // penalty: player number (yellow) and time left (red)
    if (penStr) {
      ledText(ctx, "" + cfg.penaltyNumber, 78, 512, 104, YELLOW_LED, "left");
      ledText(ctx, penStr, 242, 512, 104, RED_LED, "left");
    }
  }

  function tick(now) {
    const el = Math.min(Math.floor((now - t0) / 1000), cap - cfg.clock); // game time that ran
    const clock = cfg.clock + el;
    const penStr = fmt(Math.max(0, cfg.penalty - el), false); // stops with the game clock
    const key = clock + "|" + penStr + "|" + score.join(":");
    if (key === lastKey) return;
    lastKey = key;
    draw(fmt(clock, true), penStr);
    texture.needsUpdate = true;
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      lastKey = "";
    });
  }

  return {
    object,
    tick,
    goal() {
      if (score[0] === cfg.score[0]) score[0]++;
    },
    restart() {
      score = cfg.score.slice();
      t0 = performance.now();
      lastKey = "";
    },
  };
}

/* ===================================================== advertising boards */

let adNoiseTile = null;
let jetBrainsReady = false;
let jetBrainsPromise = null;

function ensureJetBrains() {
  if (jetBrainsReady) return Promise.resolve();
  if (jetBrainsPromise) return jetBrainsPromise;
  jetBrainsPromise = new Promise((resolve) => {
    const href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&display=swap";
    const already = [...document.querySelectorAll("link[rel='stylesheet']")].some((l) => (l.href || "").includes("JetBrains+Mono"));
    if (already) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  })
    .then(() => (document.fonts && document.fonts.load ? document.fonts.load("700 64px 'JetBrains Mono'") : null))
    .catch(() => {})
    .then(() => {
      jetBrainsReady = true;
    });
  return jetBrainsPromise;
}

function getAdNoise() {
  if (adNoiseTile) return adNoiseTile;
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  const id = ctx.createImageData(s, s);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = n;
    d[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  adNoiseTile = c;
  return c;
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function paintScrews(ctx, W, H) {
  ctx.fillStyle = "#4a4a4a";
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 2;
  for (const [x, y] of [[28, 28], [W - 28, 28], [28, H - 28], [W - 28, H - 28]]) {
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
  }
}

function paintScanlines(ctx, W, H) {
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y + 2, W, 1.2);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 0.6);
}

function paintNoise(ctx, W, H, alpha, ox, oy) {
  const tile = getAdNoise();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  const x = -((ox % tile.width) + tile.width) % tile.width;
  const y = -((oy % tile.height) + tile.height) % tile.height;
  for (let px = x; px < W; px += tile.width) {
    for (let py = y; py < H; py += tile.height) ctx.drawImage(tile, px, py);
  }
  ctx.restore();
}

const TERM_PROMPT = "damo@portfolio:~$ ";
const TERM_JOBS = [
  {
    cmd: "curl -s https://damianmoser.ch/whoami",
    lines: [
      "Damian Moser",
      "IT-Sponsor // Forti-Legends",
      "ETH Zürich · Robotics",
      "open-source tinkerer",
    ],
  },
  {
    cmd: "sudo apt-get update",
    lines: [
      "Hit:1 https://deb.debian.org/debian stable InRelease",
      "Get:2 https://download.docker.com/linux/debian stable InRelease [48.5 kB]",
      "Fetched 214 kB in 0s (1,204 kB/s)",
      "Reading package lists... Done",
    ],
    pace: 0.08,
  },
  {
    cmd: "sudo apt-get install -y docker.io docker-compose-plugin",
    lines: [
      "Reading package lists... Done",
      "Building dependency tree... Done",
      "docker.io is already the newest version (27.3.1-1).",
      "docker-compose-plugin is already the newest version (2.32.4-1).",
      "0 upgraded, 0 newly installed, 0 to remove.",
    ],
    pace: 0.07,
  },
  {
    cmd: "docker run --rm -p 8000:80 madebydamo/fortilegends:latest",
    lines: [
      "Unable to find image 'madebydamo/fortilegends:latest' locally",
      "latest: Pulling from madebydamo/fortilegends",
      "4f4fb700ef54: Pull complete",
      "a3ed95caeb02: Pull complete",
      "Digest: sha256:forti…legends",
      "Status: Downloaded newer image",
      " => hall is live on http://0.0.0.0:8000",
    ],
    pace: 0.09,
  },
  {
    cmd: "curl -I https://damianmoser.ch/",
    lines: [
      "HTTP/2 200",
      "server: nginx",
      "content-type: text/html; charset=utf-8",
      "x-powered-by: a POSIX terminal",
      "x-sponsor-of: Forti-Legends",
    ],
  },
  {
    cmd: "docker ps --format 'table {{.Names}}\\t{{.Status}}'",
    lines: [
      "NAMES             STATUS",
      "fortilegends      Up 3 years (healthy)",
      "portrait          Up (healthy)",
      "swag              Up 2 weeks",
    ],
  },
  {
    cmd: "curl -s https://damianmoser.ch/skills",
    lines: [
      "NixOS · Docker · Rust · TypeScript",
      "halls, blogs, and POSIX toys",
      "booking: damianmoser.ch",
    ],
  },
  {
    cmd: "ssh forti@legends 'echo ready'",
    lines: ["ready", "IT sponsoring is live."],
  },
];

function seedTerm() {
  return {
    job: 0,
    phase: "type",
    typed: 0,
    outI: 0,
    acc: 0,
    buf: [TERM_PROMPT + "whoami", "damo", "", TERM_PROMPT + "hostname", "damianmoser.ch", ""],
    sig: "",
  };
}

function tickTerm(term, dt, now, freeze) {
  if (freeze) {
    if (term.sig !== "static") {
      term.buf = [
        TERM_PROMPT + "curl -s https://damianmoser.ch/whoami",
        "Damian Moser",
        "IT-Sponsor // Forti-Legends",
        "",
        TERM_PROMPT + "docker run --rm madebydamo/fortilegends:latest",
        " => hall is live on http://0.0.0.0:8000",
      ];
      term.sig = "static";
      return true;
    }
    return false;
  }
  const job = TERM_JOBS[term.job % TERM_JOBS.length];
  term.acc += dt;
  const blink = Math.floor(now / 530) % 2 === 0;
  if (term.phase === "type") {
    while (term.acc >= 0.028 && term.typed < job.cmd.length) {
      term.acc -= 0.028;
      term.typed++;
    }
    const line = TERM_PROMPT + job.cmd.slice(0, term.typed) + (blink ? "█" : " ");
    if (!term.buf.length) term.buf.push(line);
    else term.buf[term.buf.length - 1] = line;
    if (term.typed >= job.cmd.length) {
      term.buf[term.buf.length - 1] = TERM_PROMPT + job.cmd;
      term.phase = "hold";
      term.acc = 0;
    }
  } else if (term.phase === "hold") {
    if (term.acc > 0.22) {
      term.phase = "out";
      term.acc = 0;
      term.outI = 0;
    }
  } else if (term.phase === "out") {
    const pace = job.pace || 0.055;
    while (term.acc >= pace && term.outI < job.lines.length) {
      term.acc -= pace;
      term.buf.push(job.lines[term.outI++]);
      if (term.buf.length > 56) term.buf.splice(0, term.buf.length - 48);
    }
    if (term.outI >= job.lines.length) {
      term.phase = "pause";
      term.acc = 0;
    }
  } else if (term.acc > 1.15) {
    term.job = (term.job + 1) % TERM_JOBS.length;
    term.phase = "type";
    term.typed = 0;
    term.outI = 0;
    term.acc = 0;
    term.buf.push("");
    term.buf.push("");
  }
  const sig = term.job + "|" + term.phase + "|" + term.typed + "|" + term.outI + "|" + (blink ? "1" : "0") + "|" + term.buf.length;
  const dirty = sig !== term.sig;
  term.sig = sig;
  return dirty;
}

function wrapChars(ctx, text, maxW) {
  if (!text) return [""];
  if (ctx.measureText(text).width <= maxW) return [text];
  const out = [];
  let line = "";
  const tokens = text.match(/\S+|\s+/g) || [text];
  const flush = () => {
    if (line) out.push(line.replace(/\s+$/, ""));
    line = "";
  };
  const hard = (tok) => {
    for (const ch of tok) {
      if (line && ctx.measureText(line + ch).width > maxW) {
        flush();
        line = ch;
      } else line += ch;
    }
  };
  for (const tok of tokens) {
    if (ctx.measureText(line + tok).width <= maxW) {
      line += tok;
      continue;
    }
    flush();
    const piece = tok.replace(/^\s+/, "");
    if (!piece) continue;
    if (ctx.measureText(piece).width <= maxW) line = piece;
    else hard(piece);
  }
  flush();
  return out.length ? out : [""];
}

function fitHeadline(ctx, lines, maxW, startSize, font) {
  let size = startSize;
  ctx.font = font.replace("$", size);
  const longest = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  if (longest > maxW) size = Math.max(26, Math.floor((size * maxW) / longest));
  ctx.font = font.replace("$", size);
  return size;
}

function fillFit(ctx, text, x, y, maxW, want, font) {
  let size = want;
  ctx.font = font.replace("$", size);
  let w = ctx.measureText(text).width;
  if (w > maxW && w > 0) {
    size = Math.max(28, Math.floor((want * maxW) / w));
    ctx.font = font.replace("$", size);
    w = ctx.measureText(text).width;
  }
  if (w > maxW && w > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(maxW / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return size;
  }
  ctx.fillText(text, x, y);
  return size;
}

function headlineLines(label) {
  const raw = String(label || "IT Sponsoring").trim();
  if (/^it\s*sponsoring$/i.test(raw)) return ["IT", "SPONSORING"];
  if (raw.toLowerCase() === "hier könnte ihre werbung stehen") return ["HIER KÖNNTE", "IHRE WERBUNG", "STEHEN"];
  const parts = raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts.map((s) => s.toUpperCase());
  return [raw.toUpperCase()];
}

function drawTermPane(ctx, x, y, w, h, term, mono) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#050505";
  ctx.fillRect(x, y, w, h);
  const size = 24;
  ctx.font = "500 " + size + "px " + mono;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lh = size * 1.32;
  const maxW = w - 20;
  const wrapped = [];
  for (const line of term.buf) {
    const parts = wrapChars(ctx, line, maxW);
    for (const p of parts) wrapped.push({ text: p, prompt: line.startsWith(TERM_PROMPT) });
  }
  const maxLines = Math.max(1, Math.floor((h - 16) / lh));
  const view = wrapped.slice(Math.max(0, wrapped.length - maxLines));
  let ty = y + 10;
  for (const row of view) {
    ctx.fillStyle = row.prompt ? "#fff" : "#aaa";
    ctx.fillText(row.text, x + 10, ty);
    ty += lh;
  }
  ctx.restore();
}

function drawTerminalAd(ctx, W, H, label, now, flash, term) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.strokeStyle = "#e11c1e";
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  const mono = jetBrainsReady ? "'JetBrains Mono', monospace" : "'Roboto Mono', ui-monospace, monospace";
  const pad = Math.round(W * 0.06);
  const maxW = W - pad * 2;
  const cx = W / 2;
  const head = ["damianmoser", ".ch"].concat(headlineLines(label));
  const size = fitHeadline(ctx, head, maxW, Math.round(W * 0.12), "800 $px " + mono);
  const lh = size * 1.05;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  let y = pad + size * 0.62;
  for (let i = 0; i < head.length; i++) {
    if (i === 2) {
      ctx.fillStyle = "#e11c1e";
      ctx.fillRect(pad + 8, y - lh * 0.42, maxW - 16, 5);
      y += 8;
      ctx.fillStyle = "#fff";
    }
    ctx.fillText(head[i], cx, y);
    y += lh;
  }

  const termTop = y + 10;
  drawTermPane(ctx, pad, termTop, W - pad * 2, Math.max(80, H - termTop - pad), term, mono);

  paintScanlines(ctx, W, H);
  paintNoise(ctx, W, H, 0.16, (now * 0.035) % 256, (now * 0.021) % 256);
  if (flash > 0) {
    ctx.fillStyle = "rgba(255,255,255," + (0.42 * flash).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  paintScrews(ctx, W, H);
}

function drawSaleAd(ctx, W, H, label, now, flash) {
  ctx.fillStyle = "#c1121f";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.48);
  for (let i = -H; i < H; i += 64) {
    ctx.fillStyle = i % 128 === 0 ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)";
    ctx.fillRect(-W, i, W * 2, 28);
  }
  ctx.restore();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.strokeStyle = "#ffd23a";
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 34, W - 68, H - 68);

  const face = "Inter, 'Arial Black', Arial, sans-serif";
  const pad = Math.round(W * 0.08);
  const maxW = W - pad * 2;
  const cx = W / 2;
  const rent = ["ZU", "VERMIETEN"];
  const rentSize = fitHeadline(ctx, rent, maxW - 20, Math.round(W * 0.14), "900 $px " + face);
  const rentLh = rentSize * 1.05;
  const plateH = Math.round(rentLh * 2 + rentSize * 0.55);

  ctx.fillStyle = "#ffd23a";
  ctx.fillRect(pad, pad, maxW, plateH);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 6;
  ctx.strokeRect(pad + 4, pad + 4, maxW - 8, plateH - 8);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111";
  ctx.font = "900 " + rentSize + "px " + face;
  let y = pad + rentSize * 0.72;
  ctx.fillText(rent[0], cx, y);
  y += rentLh;
  ctx.fillText(rent[1], cx, y);

  const lines = headlineLines(label);
  const size = fitHeadline(ctx, lines, maxW, Math.round(W * 0.115), "900 $px " + face);
  const lh = size * 1.08;
  y = pad + plateH + lh * 0.85;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lh;
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffd23a";
  fillFit(ctx, "FORTI-LEGENDS", cx, H - pad - Math.round(W * 0.08), maxW, Math.round(W * 0.055), "800 $px " + face);

  paintScanlines(ctx, W, H);
  paintNoise(ctx, W, H, 0.05, 0, 0);
  if (flash > 0) {
    ctx.fillStyle = "rgba(255,255,255," + (0.42 * flash).toFixed(3) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  paintScrews(ctx, W, H);
}

function buildAdBoard(cfg, side) {
  const W = 800;
  const H = Math.round((W * AD_H) / AD_W);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const object = new THREE.Group();
  object.userData.ad = null; // filled below
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, metalness: 0.12 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(AD_W + 0.08, AD_H + 0.08, AD_D), dark);
  body.castShadow = true;
  body.receiveShadow = true;
  outline(body);
  object.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(AD_W, AD_H), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.z = AD_D / 2 + 0.002;
  object.add(face);

  const style = cfg.style || "sale";
  const term = style === "terminal" ? seedTerm() : null;
  const freeze = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let flashUntil = 0;
  let lastKey = "";
  let lastNow = 0;

  function draw(now) {
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    const flash = flashUntil > now ? clamp((flashUntil - now) / 220, 0, 1) : 0;
    const termDirty = term ? tickTerm(term, dt, now, freeze) : false;
    const key = style + "|" + cfg.label + "|" + jetBrainsReady + "|" + flash.toFixed(2) + "|" + (term ? term.sig : Math.floor(now / 400));
    if (key === lastKey && !termDirty) return;
    lastKey = key;
    if (style === "terminal") drawTerminalAd(ctx, W, H, cfg.label, now, flash, term);
    else drawSaleAd(ctx, W, H, cfg.label, now, flash);
    texture.needsUpdate = true;
  }

  const ad = {
    object,
    canvas: c,
    side,
    url: cfg.url || "",
    label: cfg.label || "",
    style,
    term,
    hitPoint(ay) {
      object.updateMatrixWorld(true);
      const ny = clamp(0.22 + (0.5 + ay * 0.5) * 0.56, 0.16, 0.86);
      const local = new THREE.Vector3(0, ny * AD_H - AD_H / 2, AD_D / 2 + BALL_R * 0.7);
      return local.applyMatrix4(object.matrixWorld);
    },
    flash() {
      flashUntil = performance.now() + 220;
      lastKey = "";
    },
    tick: draw,
    redraw() {
      lastKey = "";
      draw(performance.now());
    },
  };
  object.userData.ad = ad;
  body.userData.ad = ad;
  face.userData.ad = ad;
  draw(0);
  return ad;
}

function placeAds(ads) {
  // same wall as the scoreboard, facing the hall — no yaw toward the camera
  const x = (BOARD_W + 0.1) / 2 + AD_GAP + (AD_W + 0.08) / 2;
  const y = AD_LIFT + AD_H / 2;
  ads.left.object.position.set(-x, y, BOARD_Z);
  ads.left.object.rotation.set(0, 0, 0);
  ads.right.object.position.set(x, y, BOARD_Z);
  ads.right.object.rotation.set(0, 0, 0);
}

function buildAds(cfg) {
  const left = buildAdBoard(cfg.left, -1);
  const right = buildAdBoard(cfg.right, 1);
  ensureJetBrains().then(() => {
    left.redraw();
    right.redraw();
  });
  return {
    left,
    right,
    tick(now) {
      left.tick(now);
      right.tick(now);
    },
    restart() {
      left.redraw();
      right.redraw();
    },
  };
}

/* Seven-segment digits made of round LEDs. Supports 0-9, ':' and ' '. */
const LED_SEGS = {
  0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc",
  5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};

function ledText(ctx, str, x, y, h, color, align) {
  const w = h * 0.55;
  const gap = h * 0.22;
  const colon = h * 0.28;
  const width = (ch) => (ch === ":" ? colon : w);
  let total = 0;
  for (const ch of str) total += width(ch) + gap;
  total -= gap;
  let cx = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  const r = h / 19;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 1.8;
  const dot = (px, py) => {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (ax, ay, bx, by) => {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      dot(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  };
  for (const ch of str) {
    if (ch === ":") {
      dot(cx + colon / 2, y + h * 0.32);
      dot(cx + colon / 2, y + h * 0.68);
    } else if (LED_SEGS[ch]) {
      const segs = LED_SEGS[ch];
      const X0 = cx + r, X1 = cx + w - r, Y0 = y + r, Ym = y + h / 2, Y1 = y + h - r;
      if (segs.includes("a")) line(X0, Y0, X1, Y0);
      if (segs.includes("b")) line(X1, Y0, X1, Ym);
      if (segs.includes("c")) line(X1, Ym, X1, Y1);
      if (segs.includes("d")) line(X0, Y1, X1, Y1);
      if (segs.includes("e")) line(X0, Ym, X0, Y1);
      if (segs.includes("f")) line(X0, Y0, X0, Ym);
      if (segs.includes("g")) line(X0, Ym, X1, Ym);
    }
    cx += width(ch) + gap;
  }
  ctx.shadowBlur = 0;
}

/* ======================================================= loaded models */

function eachMaterial(obj, fn) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m, i) => {
      const r = fn(m, o);
      if (r && r !== m) {
        if (Array.isArray(o.material)) o.material[i] = r;
        else o.material = r;
      }
    });
  });
}

function processTexture(tex, fn) {
  try {
    const img = tex.image;
    if (!img || !img.width) return tex;
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    fn(id.data);
    ctx.putImageData(id, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = tex.colorSpace;
    t.flipY = tex.flipY;
    t.wrapS = tex.wrapS;
    t.wrapT = tex.wrapT;
    t.repeat.copy(tex.repeat);
    t.offset.copy(tex.offset);
    t.channel = tex.channel;
    t.needsUpdate = true;
    return t;
  } catch (e) {
    return tex;
  }
}

/* Goal texture: black pixels become red, keeping their shading. */
function blackToRed(d) {
  const rr = (RED >> 16) & 255, rg = (RED >> 8) & 255, rb = RED & 255;
  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const sat = max === 0 ? 0 : (max - Math.min(d[i], d[i + 1], d[i + 2])) / max;
    if (max < 80 && sat < 0.5) {
      const f = 0.55 + (0.45 * max) / 80;
      d[i] = rr * f;
      d[i + 1] = rg * f;
      d[i + 2] = rb * f;
    }
  }
}

function normalize(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return { box, size, center };
}

function fitBall(obj) {
  const { size, center } = normalize(obj);
  const r = Math.max(size.x, size.y, size.z) / 2;
  if (!(r > 0)) return null;
  const wrap = new THREE.Group();
  obj.position.sub(center);
  wrap.add(obj);
  wrap.scale.setScalar(BALL_R / r);
  const seen = new Map();
  eachMaterial(obj, (m, mesh) => {
    mesh.castShadow = true;
    if (seen.has(m)) return seen.get(m);
    const mat = m.clone();
    if (mat.emissive) mat.emissive.setScalar(0);
    if ("metalness" in mat) mat.metalness = 0;
    seen.set(m, mat);
    return mat;
  });
  return wrap;
}

function fitGoal(obj, rotationDeg) {
  obj.rotation.y = ((rotationDeg || 0) * Math.PI) / 180;
  let { size } = normalize(obj);
  if (!(size.x > 0)) return null;
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.scale.setScalar((GOAL_W + 2 * POST) / size.x);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrap);
  wrap.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -box.max.z);
  wrap.updateMatrixWorld(true);

  let netMesh = null;
  let biggest = null;
  const seen = new Map();
  const solid = [];
  eachMaterial(obj, (m, mesh) => {
    const name = (mesh.name + " " + (m.name || "")).toLowerCase();
    const isNet = /net|netz|mesh/.test(name);
    if (isNet && (!netMesh || mesh.geometry.attributes.position.count > netMesh.geometry.attributes.position.count)) netMesh = mesh;
    if (!biggest || mesh.geometry.attributes.position.count > biggest.geometry.attributes.position.count) biggest = mesh;
    if (!isNet && solid.indexOf(mesh) < 0) solid.push(mesh);
    mesh.castShadow = !isNet;
    mesh.receiveShadow = true;
    if (seen.has(m)) return seen.get(m);
    const mat = m.clone();
    if (isNet) {
      mat.side = THREE.DoubleSide;
    } else if (mat.map) {
      mat.map = processTexture(mat.map, blackToRed);
    } else if (mat.color) {
      const max = Math.max(mat.color.r, mat.color.g, mat.color.b);
      const min = Math.min(mat.color.r, mat.color.g, mat.color.b);
      const dark = max < 0.3 && (max === 0 || (max - min) / max < 0.5);
      if (dark || /black|schwarz|dark/.test(name)) mat.color.setHex(RED);
    }
    seen.set(m, mat);
    return mat;
  });
  if (!netMesh) netMesh = biggest;
  solid.forEach((mesh) => {
    if (mesh !== netMesh && mesh.geometry.attributes.position.count < 60000) outline(mesh, 30);
  });
  if (netMesh && netMesh.geometry.attributes.position.count > 50) {
    const geo = netMesh.geometry;
    netMesh.geometry = geo.clone();
    const attr = netMesh.geometry.attributes.position;
    netMesh.updateMatrixWorld(true);
    const base = new Float32Array(attr.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < attr.count; i++) {
      p.fromBufferAttribute(attr, i).applyMatrix4(netMesh.matrixWorld);
      base[i * 3] = p.x;
      base[i * 3 + 1] = p.y;
      base[i * 3 + 2] = p.z;
    }
    wrap.userData.net = makeDeformer(netMesh, base, netMesh.matrixWorld);
  }
  return wrap;
}

/* ------------------------------------------------------------------ go */
const intro = document.querySelector(".intro");
if (intro && !intro.classList.contains("is-static")) boot(intro);
