document.getElementById('yr').textContent = new Date().getFullYear();

// Glowing cursor + spotlight
const dot = document.querySelector('.dot'), spot = document.querySelector('.spot');
let tx = innerWidth / 2, ty = innerHeight / 2, cx = tx, cy = ty;
addEventListener('mousemove', e => {
  tx = e.clientX; ty = e.clientY; dot.classList.add('on');
  spot.style.setProperty('--x', tx + 'px'); spot.style.setProperty('--y', ty + 'px');
});
document.addEventListener('mouseleave', () => dot.classList.remove('on'));
document.querySelectorAll('a,.btn,.card').forEach(el => {
  el.addEventListener('mouseenter', () => dot.classList.add('big'));
  el.addEventListener('mouseleave', () => dot.classList.remove('big'));
});
(function loop() {
  cx += (tx - cx) * .2; cy += (ty - cy) * .2;
  dot.style.transform = `translate(${cx}px,${cy}px)`;
  requestAnimationFrame(loop);
})();

// Reveal sections on scroll
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(s => io.observe(s));

// Highlight active nav link
const links = [...document.querySelectorAll('.nav nav a[href^="#"]')];
const spy = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) links.forEach(l => l.classList.toggle('act', l.getAttribute('href') === '#' + e.target.id));
}), { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section[id]').forEach(s => spy.observe(s));

// ===== Immersive 3D background =====
(function () {
  const canvas = document.getElementById('bg');
  if (!window.THREE || !canvas) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = innerWidth < 800;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x04060f, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04060f, 0.018);
  const camera = new THREE.PerspectiveCamera(55, 1, .1, 200);
  camera.position.set(0, 0, 11);

  // Cycling neon palette: cyan -> electric blue -> violet
  const PAL = [new THREE.Color(0x22d3ee), new THREE.Color(0x3b6bff), new THREE.Color(0x8b5cf6)];
  const tmp = new THREE.Color();
  function pal(t, out) {
    t = ((t % 3) + 3) % 3;
    const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
    return out.copy(PAL[i]).lerp(PAL[(i + 1) % 3], s);
  }

  // Layers for parallax
  const far = new THREE.Group(), mid = new THREE.Group(), near = new THREE.Group();
  scene.add(far, mid, near);

  // Soft volumetric glows (additive sprites)
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const g = gc.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  const glows = [[10, 4, -24, 34], [-14, 0, -26, 38], [0, -6, -14, 26], [-6, 8, -30, 30]].map(([x, y, z, s], i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, y, z); sp.scale.set(s, s, 1); sp.userData.i = i; far.add(sp); return sp;
  });

  // Holographic grids: floor + back wall
  const floorGrid = new THREE.GridHelper(120, 60, 0xffffff, 0xffffff);
  floorGrid.position.y = -7; floorGrid.material.transparent = true; floorGrid.material.opacity = .09; far.add(floorGrid);
  const wallGrid = new THREE.GridHelper(90, 36, 0xffffff, 0xffffff);
  wallGrid.rotation.x = Math.PI / 2; wallGrid.position.z = -34; wallGrid.material.transparent = true; wallGrid.material.opacity = .08; far.add(wallGrid);

  // Flowing particle wave (GPU shader)
  const NX = small ? 90 : 170, NZ = small ? 70 : 130, W = 100, D = 80;
  const wp = new Float32Array(NX * NZ * 3), seed = new Float32Array(NX * NZ);
  let k = 0;
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++, k++) {
    wp[k * 3] = (ix / (NX - 1) - .5) * W + (Math.random() - .5) * .3;
    wp[k * 3 + 1] = 0;
    wp[k * 3 + 2] = -(iz / (NZ - 1)) * D + 14 + (Math.random() - .5) * .3;
    seed[k] = Math.random();
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  wg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const wu = { uTime: { value: 0 }, uSize: { value: small ? 1.5 : 1.7 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() } };
  const wave = new THREE.Points(wg, new THREE.ShaderMaterial({
    uniforms: wu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime,uSize;attribute float aSeed;varying float vH;varying float vM;varying float vD;
      void main(){vec3 p=position;
        float h=sin(p.x*.22+uTime*.8)*1.1+sin(p.z*.25+uTime*.6)*1.0+sin((p.x+p.z)*.12+uTime*.4)*1.6;
        p.y+=h;vH=h;vM=.5+.5*sin(p.x*.06+p.z*.05+uTime*.25);
        vec4 mv=modelViewMatrix*vec4(p,1.);vD=-mv.z;
        gl_PointSize=uSize*(.6+aSeed*.9)*(32./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform vec3 uA,uB,uC;varying float vH;varying float vM;varying float vD;
      void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;
        float a=smoothstep(.5,0.,d);
        vec3 c=mix(mix(uA,uB,vM),uC,smoothstep(-2.,3.,vH)*.7);
        float fade=clamp(1.-vD/70.,0.,1.);
        gl_FragColor=vec4(c*1.2,a*fade*(.45+vH*.07));}`
  }));
  wave.position.y = -5; mid.add(wave);

  // Tiny floating dust
  const DN = small ? 300 : 800, dp = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) { dp[i * 3] = (Math.random() - .5) * 60; dp[i * 3 + 1] = (Math.random() - .5) * 30; dp[i * 3 + 2] = -Math.random() * 40 + 8; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: .07, color: 0x9fd8ff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
  far.add(dust);

  // Glass cubes with neon edges
  scene.add(new THREE.AmbientLight(0x223355, .8));
  const L1 = new THREE.PointLight(0x22d3ee, 2.2, 40), L2 = new THREE.PointLight(0x8b5cf6, 2.2, 40);
  L1.position.set(-8, 5, 6); L2.position.set(9, -2, 4); scene.add(L1, L2);
  const CN = small ? 6 : 10, cubes = [];
  const edgeMats = [];
  for (let i = 0; i < CN; i++) {
    const s = .7 + Math.random() * 1.3, geo = new THREE.BoxGeometry(s, s, s);
    const glass = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x5b8cff, transparent: true, opacity: .13, roughness: .05, metalness: .3, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }));
    const em = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: .95 }); edgeMats.push(em);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), em);
    const c = new THREE.Group(); c.add(glass, edges);
    c.position.set((Math.random() - .5) * 26, (Math.random() - .5) * 11 + 1, -Math.random() * 14 + 1);
    c.userData = { base: c.position.clone(), sp: .15 + Math.random() * .3, ph: Math.random() * 6.28, rx: (Math.random() - .5) * .5, ry: (Math.random() - .5) * .5 };
    cubes.push(c); (i % 2 ? near : mid).add(c);
  }

  // Digital connections between nearby cubes
  const pairs = []; for (let a = 0; a < CN; a++) for (let b = a + 1; b < CN; b++) pairs.push([a, b]);
  const lp = new Float32Array(pairs.length * 6);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lm = new THREE.LineBasicMaterial({ color: 0x3b6bff, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.LineSegments(lg, lm));
  const wa = new THREE.Vector3(), wb = new THREE.Vector3();

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let mx = 0, my = 0, sx = 0, sy = 0, sc = 0;
  addEventListener('mousemove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
  addEventListener('scroll', () => { sc = scrollY / Math.max(1, document.body.scrollHeight - innerHeight); });
  const clock = new THREE.Clock(); let T = 0;

  (function loop() {
    T += reduce ? 0 : clock.getDelta(); if (reduce) clock.getDelta();
    wu.uTime.value = T;
    pal(T * .12, wu.uA.value); pal(T * .12 + 1, wu.uB.value); pal(T * .12 + 2, wu.uC.value);
    pal(T * .12, tmp);
    edgeMats.forEach((m, i) => pal(T * .12 + i * .45, m.color));
    pal(T * .12 + 1.5, lm.color);
    floorGrid.material.color.copy(pal(T * .12 + .5, tmp)); wallGrid.material.color.copy(pal(T * .12 + 1.5, tmp));
    L1.color.copy(pal(T * .12, tmp)); L2.color.copy(pal(T * .12 + 1.6, tmp));
    glows.forEach(s => { s.material.color.copy(pal(T * .1 + s.userData.i * .8, tmp)); s.position.x += Math.sin(T * .2 + s.userData.i) * .004; });

    cubes.forEach(c => { const u = c.userData;
      c.position.y = u.base.y + Math.sin(T * u.sp + u.ph) * .8; c.position.x = u.base.x + Math.cos(T * u.sp * .7 + u.ph) * .5;
      c.rotation.x += u.rx * .004; c.rotation.y += u.ry * .004; });
    pairs.forEach(([a, b], i) => {
      cubes[a].getWorldPosition(wa); cubes[b].getWorldPosition(wb);
      const on = wa.distanceTo(wb) < 10; const o = i * 6;
      lp[o] = wa.x; lp[o + 1] = wa.y; lp[o + 2] = wa.z;
      lp[o + 3] = on ? wb.x : wa.x; lp[o + 4] = on ? wb.y : wa.y; lp[o + 5] = on ? wb.z : wa.z;
    });
    lg.attributes.position.needsUpdate = true;

    // Smooth parallax
    sx += (mx - sx) * .04; sy += (my - sy) * .04;
    camera.position.x = sx * 3; camera.position.y = -sy * 2 - sc * 4;
    camera.lookAt(sx * .5, -1 - sc * 3, -4);
    far.position.x = -sx * 1.2; mid.position.x = -sx * 2.4; near.position.x = -sx * 4; near.position.y = sy * 1.5;
    dust.rotation.y = T * .01; dust.position.y = Math.sin(T * .1) * .5;

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
})();

// ===== Resume download (works even if assets/ is missing or in in-app browsers) =====
(function () {
  function toBlob() {
    const bin = atob(window.RESUME_B64 || ''), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: 'application/pdf' });
  }
  document.querySelectorAll('[data-resume]').forEach(a => {
    a.addEventListener('click', e => {
      if (!window.RESUME_B64) return;            // no embedded copy: let the normal link work
      e.preventDefault();
      try {
        const url = URL.createObjectURL(toBlob());
        const t = document.createElement('a');
        t.href = url; t.download = 'Dhanush_Resume.pdf';
        document.body.appendChild(t); t.click(); t.remove();
        // fallback for browsers that ignore download (some iOS / in-app browsers)
        setTimeout(() => { if (/FBAN|FBAV|Instagram|Line|WhatsApp|wv\)/i.test(navigator.userAgent)) window.open(url, '_blank'); }, 400);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { window.open('assets/Dhanush_Resume.pdf', '_blank'); }
    });
  });
})();
