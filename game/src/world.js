// world.js — WILDFIRE TANKER: the valley at golden hour. Terrain with vertex
// colours, Mirror Lake, Cedar Fork town, the air base, the lookout tower, and
// the fire itself: glowing fronts, smoke columns and the drop plume. All
// procedural; nothing is loaded from outside game/.
import * as THREE from 'three';
import { WORLD, PLACES, terrainHeight } from './state.js';

function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function buildWorld(scene, state) {
  const api = { fireGroups: [], smoke: [], plume: null, spray: null, sun: null };

  // Golden-hour sky: a warm gradient dome and a low sun disc.
  const skyGeo = new THREE.SphereGeometry(6000, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3f6fb4) },
      mid: { value: new THREE.Color(0xe8a35c) },
      bot: { value: new THREE.Color(0xff7a33) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;'
      + 'void main(){ float h = normalize(vP).y; vec3 c = h > 0.10 ? mix(mid, top, smoothstep(0.10, 0.45, h)) : mix(bot, mid, smoothstep(-0.08, 0.10, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const sun = new THREE.Mesh(new THREE.CircleGeometry(190, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }));
  sun.position.set(-2600, 620, -4200);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  api.sun = sun;

  // Warm key light low from the west, cool fill from the sky, long shadows.
  const key = new THREE.DirectionalLight(0xffb36b, 2.6);
  key.position.set(-1800, 900, -900);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1600; key.shadow.camera.right = 1600;
  key.shadow.camera.top = 1600; key.shadow.camera.bottom = -1600;
  key.shadow.camera.far = 6000;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0x8fb4e8, 0x5c4a2e, 0.9));
  scene.add(new THREE.AmbientLight(0xffd9a0, 0.25));

  // Terrain: a displaced plane, coloured per height and per place — green
  // valley, gold meadow, dark scorched ground inside the fire zones.
  const seg = 150;
  const tg = new THREE.PlaneGeometry(WORLD.size, WORLD.size, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const green = new THREE.Color(0x3d6e2e), meadow = new THREE.Color(0x7d9a45);
  const rock = new THREE.Color(0x7a6a58), scorch = new THREE.Color(0x1c1410);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = hash2(Math.floor(x / 37), Math.floor(z / 37));
    c.copy(green).lerp(meadow, clamp(0.3 + n * 0.5, 0, 1));
    if (h > 90) c.lerp(rock, clamp((h - 90) / 130, 0, 1));
    for (const zone of state.zones) {
      const dx = x - zone.x, dz = z - zone.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < zone.radius * zone.radius * 1.15) {
        const t = 1 - Math.sqrt(d2) / (zone.radius * 1.08);
        c.lerp(scorch, clamp(t * 1.4, 0, 0.92));
      }
    }
    colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Mirror Lake: a flat blue disc with a warm sun glint stripe.
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48),
    new THREE.MeshStandardMaterial({ color: 0x2f6fb4, roughness: 0.12, metalness: 0.55 }));
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(PLACES.lake.rx, PLACES.lake.rz, 1);
  lake.position.set(PLACES.lake.x, PLACES.lake.waterY, PLACES.lake.z);
  scene.add(lake);
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(520, 60),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.55 }));
  glint.rotation.x = -Math.PI / 2;
  glint.rotation.z = 0.5;
  glint.position.set(PLACES.lake.x - 60, PLACES.lake.waterY + 0.4, PLACES.lake.z);
  scene.add(glint);

  // Cedar Fork town: a dozen homes with lit windows, a church spire, and a
  // water tower — the thing the town-edge fire threatens.
  const townG = new THREE.Group();
  const wallCols = [0xd8c9a8, 0xc9b48a, 0xb8a58a, 0xe0d6c0];
  for (let i = 0; i < PLACES.town.structures; i++) {
    const a = (i / PLACES.town.structures) * Math.PI * 2;
    const hx = PLACES.town.x + Math.cos(a) * (55 + (i % 3) * 34);
    const hz = PLACES.town.z + Math.sin(a) * (45 + (i % 4) * 26);
    const w = 12 + (i % 3) * 4, d = 10 + (i % 2) * 4, hgt = 7 + (i % 3) * 2.5;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d),
      new THREE.MeshStandardMaterial({ color: wallCols[i % wallCols.length], roughness: 0.85 }));
    house.position.set(hx, terrainHeight(hx, hz) + hgt / 2, hz);
    house.rotation.y = a * 0.7;
    house.castShadow = true;
    townG.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0x8a3a28, roughness: 0.8 }));
    roof.position.set(hx, terrainHeight(hx, hz) + hgt + 2, hz);
    roof.rotation.y = Math.PI / 4 + a * 0.7;
    townG.add(roof);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    win.position.set(hx, terrainHeight(hx, hz) + hgt * 0.55, hz + d / 2 + 0.1);
    townG.add(win);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 22, 6),
    new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.7 }));
  spire.position.set(PLACES.town.x - 40, terrainHeight(PLACES.town.x - 40, PLACES.town.z + 30) + 16, PLACES.town.z + 30);
  townG.add(spire);
  scene.add(townG);

  // Air base: runway strip with threshold marks, a hangar, a windsock and a
  // parked tanker on the ramp.
  const baseG = new THREE.Group();
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(PLACES.base.runwayLen, 42),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 }));
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = Math.PI / 2;
  strip.position.set(PLACES.base.x, terrainHeight(PLACES.base.x, PLACES.base.z) + 0.6, PLACES.base.z);
  baseG.add(strip);
  for (let i = -2; i <= 2; i++) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(16, 2.4),
      new THREE.MeshBasicMaterial({ color: 0xf2f2e8 }));
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = Math.PI / 2;
    mark.position.set(PLACES.base.x + i * 110, terrainHeight(PLACES.base.x, PLACES.base.z) + 0.8, PLACES.base.z);
    baseG.add(mark);
  }
  const hangar = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 46, 12, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.6, metalness: 0.4 }));
  hangar.rotation.z = Math.PI / 2;
  hangar.rotation.y = Math.PI / 2;
  hangar.position.set(PLACES.base.x + 60, terrainHeight(PLACES.base.x + 60, PLACES.base.z + 90) + 2, PLACES.base.z + 90);
  baseG.add(hangar);
  scene.add(baseG);

  // Eagle Lookout: a steel tower on the knoll with a lit cab.
  const lookG = new THREE.Group();
  const lx = PLACES.lookout.x, lz = PLACES.lookout.z, ly = terrainHeight(lx, lz);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.7, metalness: 0.4 }));
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    leg.position.set(lx + Math.cos(a) * 4, ly + 15, lz + Math.sin(a) * 4);
    leg.rotation.z = Math.cos(a) * 0.18;
    leg.rotation.x = -Math.sin(a) * 0.18;
    lookG.add(leg);
  }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 9),
    new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.8 }));
  cab.position.set(lx, ly + 32, lz);
  lookG.add(cab);
  const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(9.4, 2, 9.4),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  cabGlass.position.set(lx, ly + 33, lz);
  lookG.add(cabGlass);
  scene.add(lookG);

  // Pine forest: instanced trunks and crowns scattered off the flats.
  const treeCount = 520;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 7, 5);
  const crownGeo = new THREE.ConeGeometry(3.4, 11, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.95 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2e5a26, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  const m4 = new THREE.Matrix4();
  let placed = 0, guard = 0;
  while (placed < treeCount && guard++ < 8000) {
    const x = (hash2(guard, 11) - 0.5) * 3600;
    const z = (hash2(guard, 23) - 0.5) * 3600;
    const lx2 = (x - PLACES.lake.x) / PLACES.lake.rx;
    const lz2 = (z - PLACES.lake.z) / PLACES.lake.rz;
    if (lx2 * lx2 + lz2 * lz2 < 1.15) continue;
    if (Math.abs(x - PLACES.base.x) < 380 && Math.abs(z - PLACES.base.z) < 200) continue;
    const dx = x - PLACES.town.x, dz = z - PLACES.town.z;
    if (dx * dx + dz * dz < 260 * 260) continue;
    let inFire = false;
    for (const zone of state.zones) {
      const fx = x - zone.x, fz = z - zone.z;
      if (fx * fx + fz * fz < zone.radius * zone.radius) { inFire = true; break; }
    }
    if (inFire) continue;
    const s = 0.8 + hash2(guard, 31) * 0.7;
    m4.makeScale(s, s, s);
    m4.setPosition(x, terrainHeight(x, z) + 3.2 * s, z);
    trunks.setMatrixAt(placed, m4);
    m4.setPosition(x, terrainHeight(x, z) + (6 + 5.5) * s - 3.2 * s, z);
    crowns.setMatrixAt(placed, m4);
    placed++;
  }
  trunks.count = placed; crowns.count = placed;
  trunks.castShadow = true; crowns.castShadow = true;
  scene.add(trunks); scene.add(crowns);

  // The fire: per zone a ring of flame cones with an orange point light,
  // plus a smoke column of drifting grey sprites.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
  const flameCore = new THREE.MeshBasicMaterial({ color: 0xffd23e });
  for (const zone of state.zones) {
    const fg = new THREE.Group();
    const n = 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash2(i, 7) * 0.5;
      const rr = zone.radius * (0.55 + hash2(i, 13) * 0.45);
      const fx = zone.x + Math.cos(a) * rr;
      const fz = zone.z + Math.sin(a) * rr;
      const h = 18 + hash2(i, 19) * 30;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(5 + hash2(i, 29) * 6, h, 5), flameMat);
      flame.position.set(fx, terrainHeight(fx, fz) + h / 2, fz);
      fg.add(flame);
      const core = new THREE.Mesh(new THREE.ConeGeometry(2.6, h * 0.55, 5), flameCore);
      core.position.set(fx, terrainHeight(fx, fz) + h * 0.28, fz);
      fg.add(core);
    }
    // A glowing ground disc so the fire reads from above, not only edge-on.
    const glow = new THREE.Mesh(new THREE.CircleGeometry(zone.radius * 0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(zone.x, terrainHeight(zone.x, zone.z) + 2, zone.z);
    fg.add(glow);
    const light = new THREE.PointLight(0xff5a1a, 1400, 800, 1.8);
    light.position.set(zone.x, terrainHeight(zone.x, zone.z) + 50, zone.z);
    fg.add(light);
    scene.add(fg);
    api.fireGroups.push({ group: fg, zone, light });
    // Smoke: 14 sprites per zone, rising and drifting south-east with wind.
    const smokeMat = new THREE.SpriteMaterial({ color: 0x4a4642, transparent: true, opacity: 0.42, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(smokeMat.clone());
      const a = hash2(i, 41) * Math.PI * 2;
      const rr = zone.radius * hash2(i, 43);
      sp.position.set(
        zone.x + Math.cos(a) * rr,
        terrainHeight(zone.x, zone.z) + 60 + hash2(i, 47) * 160,
        zone.z + Math.sin(a) * rr);
      const s = 40 + hash2(i, 53) * 60;
      sp.scale.set(s, s, 1);
      sp.userData = { zone, seed: i, baseY: sp.position.y, baseX: sp.position.x, baseZ: sp.position.z };
      scene.add(sp);
      api.smoke.push(sp);
    }
  }

  // Particle pools: the white drop plume and the lake scoop spray. Both use
  // a soft round sprite, never a hard square: a square point reads as a
  // glitch at contact-sheet size, a soft disc reads as water.
  function softTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.65)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  const puffTex = softTexture();
  function makePool(count, color, size, opacity) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size, transparent: true, opacity, sizeAttenuation: true,
      depthWrite: false, map: puffTex,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    return { pts, vel: new Float32Array(count * 3), life: new Float32Array(count), count, next: 0 };
  }
  api.plume = makePool(900, 0xf4fbff, 3.2, 0.6);
  api.spray = makePool(500, 0xd8ecff, 2.2, 0.55);

  // The plume lands as a LINE along the flight path, not a disc: the
  // tanker drops while moving, and a line reads as a drop from the air.
  api.spawnPlume = (x, y, z, spreadM, colour, headingDeg = 90) => {
    const pool = api.plume;
    pool.pts.material.color.set(colour);
    const h = (headingDeg * Math.PI) / 180;
    const fx = Math.sin(h), fz = -Math.cos(h);
    const rx = Math.cos(h), rz = Math.sin(h);
    for (let i = 0; i < 240; i++) {
      const k = pool.next; pool.next = (pool.next + 1) % pool.count;
      pool.life[k] = 1.6 + Math.random() * 1.2;
      const along = (Math.random() - 0.5) * spreadM * 2.4;
      const across = (Math.random() - 0.5) * spreadM * 0.8;
      pool.pts.geometry.attributes.position.setXYZ(k,
        x + fx * along + rx * across, y + Math.random() * 5, z + fz * along + rz * across);
      pool.vel[k * 3] = (fx * along + rx * across) * 0.15;
      pool.vel[k * 3 + 1] = -10 - Math.random() * 8;
      pool.vel[k * 3 + 2] = (fz * along + rz * across) * 0.15 + 6;
    }
    pool.pts.geometry.attributes.position.needsUpdate = true;
  };
  api.spawnSpray = (x, y, z) => {
    const pool = api.spray;
    for (let i = 0; i < 26; i++) {
      const k = pool.next; pool.next = (pool.next + 1) % pool.count;
      pool.life[k] = 0.5 + Math.random() * 0.5;
      pool.pts.geometry.attributes.position.setXYZ(k,
        x + (Math.random() - 0.5) * 8, y + Math.random() * 2, z + (Math.random() - 0.5) * 8);
      pool.vel[k * 3] = (Math.random() - 0.5) * 20;
      pool.vel[k * 3 + 1] = 6 + Math.random() * 10;
      pool.vel[k * 3 + 2] = 12 + Math.random() * 14;
    }
    pool.pts.geometry.attributes.position.needsUpdate = true;
  };
  api.stepParticles = (dt) => {
    for (const pool of [api.plume, api.spray]) {
      const attr = pool.pts.geometry.attributes.position;
      for (let k = 0; k < pool.count; k++) {
        if (pool.life[k] <= 0) continue;
        pool.life[k] -= dt;
        if (pool.life[k] <= 0) { attr.setXYZ(k, 0, -500, 0); continue; }
        attr.setXYZ(k,
          attr.getX(k) + pool.vel[k * 3] * dt,
          attr.getY(k) + pool.vel[k * 3 + 1] * dt,
          attr.getZ(k) + pool.vel[k * 3 + 2] * dt);
        pool.vel[k * 3 + 1] += (pool === api.plume ? -6 : -22) * dt;
      }
      attr.needsUpdate = true;
    }
  };
  api.stepFireVisual = (t) => {
    for (const { group, zone, light } of api.fireGroups) {
      // Containment knocks the fire down but never erases it from the frame:
      // the drop lands on a still-burning front, and the cover needs the
      // orange to read against the white plume.
      const f = zone.containment >= 1 ? 0.35 : 1 - zone.containment * 0.4;
      group.visible = f > 0.2;
      light.intensity = 1400 * f * (0.85 + 0.15 * Math.sin(t * 7 + zone.x));
      group.children.forEach((ch, i) => {
        if (ch.type === 'Mesh' && ch.geometry.type === 'ConeGeometry') {
          ch.scale.y = f * (1 + 0.18 * Math.sin(t * 5 + i * 1.7));
        } else if (ch.type === 'Mesh' && ch.geometry.type === 'CircleGeometry') {
          ch.material.opacity = 0.6 * f;
        }
      });
    }
    for (const sp of api.smoke) {
      const u = sp.userData;
      const rise = ((t * 6 + u.seed * 37) % 160);
      sp.position.y = u.baseY + rise;
      sp.position.x = u.baseX + rise * 0.45; // wind drift south-east
      sp.position.z = u.baseZ + rise * 0.3;
      sp.material.opacity = 0.42 * (1 - rise / 220);
    }
  };

  scene.fog = new THREE.Fog(0xe8a35c, 1800, 5200);
  return api;
}
