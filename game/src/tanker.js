// tanker.js — WILDFIRE TANKER: the air tanker itself, built from primitives.
// A high-wing twin-prop water bomber in fire-service red and yellow, with a
// belly tank, floats and spinning props. No loaded model, no copied mesh.
import * as THREE from 'three';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}

export function buildTanker() {
  const g = new THREE.Group();
  g.name = 'TANKER 7';

  const red = mat(0xd8381e);
  const yellow = mat(0xf5b81c);
  const dark = mat(0x2a2e33, { roughness: 0.4, metalness: 0.6 });
  const glass = mat(0x9fd8e8, { roughness: 0.15, metalness: 0.7 });

  // Fuselage: a long rounded body, nose forward (-z is forward in our rig).
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 7.2, 14), red);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.1;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.12, 14, 10), yellow);
  nose.scale.set(1, 0.95, 1.15);
  nose.position.set(0, 0.12, -3.55);
  g.add(nose);
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.28, 2.4, 12), red);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.28, 4.6);
  g.add(tailCone);

  // Cockpit glass and the big "7" stripe the chase cam reads.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), glass);
  canopy.scale.set(1, 0.62, 1.5);
  canopy.position.set(0, 0.85, -2.35);
  g.add(canopy);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.34, 3.4), yellow);
  stripe.position.set(0, 0.1, 0.4);
  g.add(stripe);

  // High wing with red tips, and the tailplane.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.22, 2.1), yellow);
  wing.position.set(0, 1.05, -0.4);
  g.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 2.1), red);
    tip.position.set(s * 6.5, 1.05, -0.4);
    g.add(tip);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 1.5), red);
    fin.position.set(s * 1.05, 1.5, 5.4);
    g.add(fin);
  }
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 1.3), yellow);
  tailplane.position.set(0, 1.15, 5.3);
  g.add(tailplane);

  // Belly tank with drop doors, and the two floats.
  const tank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 3.2), dark);
  tank.position.set(0, -1.05, 0.2);
  g.add(tank);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 2.6), yellow);
  doorL.position.set(-0.38, -1.52, 0.2);
  g.add(doorL);
  const doorR = doorL.clone();
  doorR.position.x = 0.38;
  g.add(doorR);
  for (const s of [-1, 1]) {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 4.6, 10), yellow);
    float.rotation.x = Math.PI / 2;
    float.position.set(s * 1.9, -1.35, -0.6);
    g.add(float);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), dark);
    strut.position.set(s * 1.9, -0.85, -0.6);
    g.add(strut);
  }

  // Twin props on the wing leading edge; the spinner + blades spin in main.js.
  const props = [];
  for (const s of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 2.2, 10), red);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(s * 3.1, 0.75, -0.9);
    g.add(nacelle);
    const hub = new THREE.Group();
    hub.position.set(s * 3.1, 0.75, -2.15);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), dark);
    spinner.rotation.x = -Math.PI / 2;
    hub.add(spinner);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.3, 0.07), dark);
      blade.rotation.z = (b * Math.PI * 2) / 3;
      hub.add(blade);
    }
    g.add(hub);
    props.push(hub);
  }

  // Wingtip nav lights (red left, green right) and a white strobe on the tail.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  navL.position.set(-6.9, 1.05, -0.4);
  g.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x2aff66 }));
  navR.position.set(6.9, 1.05, -0.4);
  g.add(navR);

  g.userData.props = props;
  return g;
}

// A second, smaller tanker parked on the ramp at base, so the airfield reads
// as a working tanker base and not an empty strip.
export function buildParkedTanker() {
  const g = buildTanker();
  g.scale.setScalar(0.92);
  return g;
}
