// --- Simulation Parameters ---
const TOTAL_PARTICLES = 2200;
const MIN_ORGANISMS = 30;
const MAX_ORGANISMS = 60;
const FOG_PARTICLE_COUNT = 800;

// [수정] 식물과 어우러지는 보태니컬 네온 컬러 팔레트 구성
const PALETTES = [
  // Palette A: 신비로운 네온 이끼 & 숲 (Neon Forest & Moss)
  // 식물의 초록색과 완벽히 동화되면서도 사이버펑크한 느낌을 주는 깊은 그린/민트 조합
  { bg: [4, 18, 12], primary: [12, 59, 39], secondary: [0, 204, 126], accent: [130, 255, 160], core: [255, 255, 255] },
  
  // Palette B: 반딧불이 & 애시드 라임 (Firefly & Acid Lime)
  // 식물 옆에서 숲속의 요정이나 반딧불이 포자처럼 밝게 빛나는 라임 그린과 네온 옐로우 조합
  { bg: [12, 16, 4], primary: [50, 64, 10], secondary: [180, 230, 30], accent: [245, 255, 50], core: [255, 255, 255] },
  
  // Palette C: 심해의 네온 난초 (Cyber Orchid & Cyan)
  // 초록색 식물과 대비되어 식물을 더 돋보이게 만들어주는 화려한 네온 마젠타와 신비로운 청록색 조합
  { bg: [16, 6, 18], primary: [60, 12, 65], secondary: [210, 0, 255], accent: [0, 255, 210], core: [255, 255, 255] }
];

// Global State Variables
let currentPaletteIndex = 0;
let targetPaletteIndex = 1;
let paletteTransitionProgress = 0;
let currentColors = {};

let organisms = [];
let fogParticles = [];
let flowTime = 0;

// --- Entity Definitions ---

class Particle {
  constructor(depthLayer, parentOrganism) {
    this.parent = parentOrganism;
    this.depth = depthLayer; // 0 (far/bg) to 1 (near/fg)
    this.reset();
    // Stagger initial Y to distribute entry evenly
    this.pos.y = random(height * 0.2, height + 300);
  }

  reset() {
    // Spawn below canvas base, clustered slightly around the parent organism's center
    let spawnWidth = map(this.depth, 0, 1, 150, 50);
    this.pos = createVector(
      this.parent.centerX + random(-spawnWidth, spawnWidth), 
      height + random(50, 400)
    );
    this.vel = createVector(0, map(this.depth, 0, 1, -0.3, -1.2));
    this.acc = createVector(0, 0);
    this.maxSpeed = map(this.depth, 0, 1, 1.0, 3.2);
    this.age = 0;
    this.life = random(600, 1200);
    this.history = [];
    this.historyLength = Math.floor(map(this.depth, 0, 1, 5, 12));
    
    // [유지] 요청하셨던 약간 더 커진 입자 크기 밸런스 (2.5 ~ 7.5)
    this.size = map(this.depth, 0, 1, 2.5, 7.5);
  }

  update(flowVector) {
    this.age++;

    // Track position history for volumetric tail rendering
    this.history.push(this.pos.copy());
    if (this.history.length > this.historyLength) {
      this.history.shift();
    }

    // Base upward force combined with multi-scale flow field forces
    let upwardBias = createVector(0, map(this.depth, 0, 1, -0.015, -0.04));
    
    this.acc.add(flowVector);
    this.acc.add(upwardBias);
    
    // Slight structural attraction to keep organism cohesive
    let toParent = createVector(this.parent.centerX - this.pos.x, 0);
    this.acc.add(toParent.mult(0.0001));

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0); // Flush acceleration

    // Recycle particle once it drifts off top or ages out
    if (this.pos.y < -50 || this.age > this.life || this.pos.x < -100 || this.pos.x > width + 100) {
      this.reset();
    }
  }

  draw() {
    let alphaFade = sin(PI * (this.age / this.life)); // Smooth ease in/out opacity
    let baseAlpha = map(this.depth, 0, 1, 30, 180) * alphaFade;

    // Core Particle Glow Stack
    noStroke();
    
    // Outer atmospheric halo (입자 크기에 맞춘 화사한 광성 효과)
    fill(currentColors.secondary[0], currentColors.secondary[1], currentColors.secondary[2], baseAlpha * 0.12);
    ellipse(this.pos.x, this.pos.y, this.size * 3.5);
    
    // Inner vibrant body
    fill(currentColors.accent[0], currentColors.accent[1], currentColors.accent[2], baseAlpha * 0.5);
    ellipse(this.pos.x, this.pos.y, this.size * 1.8);

    // High-intensity focal center
    fill(currentColors.core[0], currentColors.core[1], currentColors.core[2], baseAlpha * 0.9);
    ellipse(this.pos.x, this.pos.y, this.size);
  }
}

class Organism {
  constructor() {
    this.centerX = random(width * 0.05, width * 0.95);
    this.depth = random(0, 1); // Structural depth mapping
    this.particles = [];
    
    // Scale size and count based on layer depth (Parallax)
    let particleCount = Math.floor(map(this.depth, 0, 1, 20, 75));
    for (let i = 0; i < particleCount; i++) {
      this.particles.push(new Particle(this.depth, this));
    }
  }

  update(time) {
    // Dynamic drifting of collective center point via Perlin field
    let n = noise(this.centerX * 0.002, time * 0.01);
    this.centerX += map(n, 0, 1, -0.8, 0.8);
    this.centerX = constrain(this.centerX, -50, width + 50);

    // Compute dynamic local flow force field coordinates
    for (let p of this.particles) {
      let scale = map(this.depth, 0, 1, 0.002, 0.0008); 
      let nVal = noise(p.pos.x * scale, p.pos.y * scale, time);
      let angle = map(nVal, 0, 1, -HALF_PI, -PI - HALF_PI); // Upward biased angle orientation
      let force = p5.Vector.fromAngle(angle).mult(map(this.depth, 0, 1, 0.02, 0.08));
      p.update(force);
    }
  }

  drawMembrane() {
    if (this.particles.length < 3) return;

    // Filter active coordinates for structural membrane mapping
    let points = this.particles.map(p => p.pos).filter(pos => pos.y < height && pos.y > 0);
    if (points.length < 5) return;

    // Compute simple spatial bounds array for soft cell encapsulation
    let alphaFade = sin(PI * (this.particles[0].age / this.particles[0].life));
    let membraneAlpha = map(this.depth, 0, 1, 2, 12) * (alphaFade ? max(0, alphaFade) : 1);

    stroke(currentColors.primary[0], currentColors.primary[1], currentColors.primary[2], membraneAlpha);
    strokeWeight(map(map(this.depth, 0, 1, 1, 3), 1, 3, 1.5, 3.5));
    fill(currentColors.primary[0], currentColors.primary[1], currentColors.primary[2], membraneAlpha * 0.2);

    // Draw dynamic organic contour wrapping around the cluster elements
    beginShape();
    for (let i = 0; i < points.length; i += 4) {
      // Create a smooth continuous curve through stepping selection
      curveVertex(points[i].x, points[i].y);
    }
    // Close vertex loop organically
    curveVertex(points[0].x, points[0].y);
    curveVertex(points[1].x, points[1].y);
    endShape();
  }

  draw() {
    for (let p of this.particles) {
      p.draw();
    }
  }
}

class AtmosphericFog {
  constructor() {
    this.reset();
    this.pos.y = random(0, height);
  }

  reset() {
    this.pos = createVector(random(-100, width + 100), height + random(10, 200));
    this.vel = createVector(random(-0.1, 0.1), random(-0.1, -0.4));
    this.size = random(80, 240);
    this.noiseScale = random(0.0005, 0.0015);
    this.density = random(1, 4);
  }

  update(time) {
    let n = noise(this.pos.x * this.noiseScale, this.pos.y * this.noiseScale, time * 0.5);
    let angle = map(n, 0, 1, -PI * 0.25, -PI * 0.75);
    let flow = p5.Vector.fromAngle(angle).mult(0.02);
    
    this.vel.add(flow);
    this.vel.limit(0.5);
    this.pos.add(this.vel);

    if (this.pos.y < -this.size || this.pos.x < -this.size || this.pos.x > width + this.size) {
      this.reset();
    }
  }

  draw() {
    noStroke();
    // Very faint, large volumetric layer to construct depth field perspective
    fill(currentColors.primary[0], currentColors.primary[1], currentColors.primary[2], this.density);
    ellipse(this.pos.x, this.pos.y, this.size);
  }
}

// --- Setup and Initialization ---

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1); // Lock for smooth performance scaling across high-res displays
  background(PALETTES[currentPaletteIndex].bg[0], PALETTES[currentPaletteIndex].bg[1], PALETTES[currentPaletteIndex].bg[2]);
  
  // Initialize Global Interpolation Palette Target Colors
  updatePaletteInterpolation();

  // Instantiate Variable Scale Organism Clustering System
  let generatedOrganisms = random(MIN_ORGANISMS, MAX_ORGANISMS);
  for (let i = 0; i < generatedOrganisms; i++) {
    organisms.push(new Organism());
  }

  // Instantiate Ambient Fluid Atmospheric Layers
  for (let i = 0; i < FOG_PARTICLE_COUNT; i++) {
    fogParticles.push(new AtmosphericFog());
  }
}

// --- Main Render Loop ---

function draw() {
  // Update Palette Cycle Clock (Transition trigger every 25 seconds)
  handlePaletteCycling();

  // Cinematic Accumulation Accumulator (Memory Trail Engine)
  blendMode(BLEND);
  noStroke();
  fill(currentColors.bg[0], currentColors.bg[1], currentColors.bg[2], 9); 
  rect(0, 0, width, height);

  // Advance Perlin Space Coordinates
  flowTime += 0.0015;

  // Render Depth Fields / Atmospheric Layer
  for (let fog of fogParticles) {
    fog.update(flowTime);
    fog.draw();
  }

  // Enable Volumetric Specular Composition Mode
  blendMode(ADD);

  // Update System Models
  for (let org of organisms) {
    org.update(flowTime);
  }

  // Step 1: Render Inter-Organism Membranes & Soft Tissue Profiles
  for (let org of organisms) {
    org.drawMembrane();
  }

  // Step 2: Draw Sparse Biological Neural Links between adjacent systems
  drawNeuralConnections();

  // Step 3: Draw Bioluminescent Core Particles
  for (let org of organisms) {
    org.draw();
  }
}

// --- Algorithmic Feature Functions ---

function drawNeuralConnections() {
  strokeWeight(0.5);
  // Perform sparse relational pairing loops for nearby proximity networks
  for (let i = 0; i < organisms.length; i += 2) {
    let orgA = organisms[i];
    let nextIdx = (i + 1) % organisms.length;
    let orgB = organisms[nextIdx];

    if (orgA.depth > 0.4 && orgB.depth > 0.4) { // Only render connections in Mid/Foreground layers
      let pA = orgA.particles[0].pos;
      let pB = orgB.particles[0].pos;

      let d = dist(pA.x, pA.y, pB.x, pB.y);
      if (d > 50 && d < 280) {
        let alpha = map(d, 50, 280, 45, 0);
        stroke(currentColors.secondary[0], currentColors.secondary[1], currentColors.secondary[2], alpha * 0.4);
        noFill();
        
        // Calculate organic curve vertices using midpoint displacement 
        let midX = (pA.x + pB.x) * 0.5 + sin(flowTime + i) * 30;
        let midY = (pA.y + pB.y) * 0.5 + cos(flowTime + i) * 30;

        beginShape();
        curveVertex(pA.x, pA.y);
        curveVertex(pA.x, pA.y);
        curveVertex(midX, midY);
        curveVertex(pB.x, pB.y);
        curveVertex(pB.x, pB.y);
        endShape();
      }
    }
  }
}

function handlePaletteCycling() {
  paletteTransitionProgress += 0.0012; // Controls transition rate speed
  if (paletteTransitionProgress >= 1.0) {
    paletteTransitionProgress = 0;
    currentPaletteIndex = targetPaletteIndex;
    targetPaletteIndex = (targetPaletteIndex + 1) % PALETTES.length;
  }
  updatePaletteInterpolation();
}

function updatePaletteInterpolation() {
  let p1 = PALETTES[currentPaletteIndex];
  let p2 = PALETTES[targetPaletteIndex];
  let amt = paletteTransitionProgress;

  // Linear Interpolate Vector Channels across targeted multi-array systems
  currentColors.bg = lerpChannels(p1.bg, p2.bg, amt);
  currentColors.primary = lerpChannels(p1.primary, p2.primary, amt);
  currentColors.secondary = lerpChannels(p1.secondary, p2.secondary, amt);
  currentColors.accent = lerpChannels(p1.accent, p2.accent, amt);
  currentColors.core = lerpChannels(p1.core, p2.core, amt);
}

function lerpChannels(arr1, arr2, amt) {
  return [
    lerp(arr1[0], arr2[0], amt),
    lerp(arr1[1], arr2[1], amt),
    lerp(arr1[2], arr2[2], amt)
  ];
}

// --- Window Lifecycle Handling ---

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(currentColors.bg[0], currentColors.bg[1], currentColors.bg[2]);
}