// --- 결합된 시뮬레이션 파라미터 ---
const MIN_ORGANISMS = 6;  
const MAX_ORGANISMS = 12;
const FOG_PARTICLE_COUNT = 150;

let organisms = [];
let fogParticles = [];
let bubbles = [];
let flowTime = 0;

// 사이버펑크 보태니컬 5색 HEX 팔레트 완벽 이식
const paletteA = ["#1f0038", "#005f5a", "#00a685", "#00ffcc", "#a6ff8c"];
const paletteB = ["#3F00FF", "#6200FF", "#00FF66", "#77FF33", "#FFF2A8"];
const paletteC = ["#004d40", "#007C7A", "#00A6A6", "#69F0AE", "#D6FFFB"];

let palettes = [paletteA, paletteB, paletteC];
let activePaletteIndex = 0;
let lastPaletteSwitch = 0;

// --- Setup and Initialization ---

function setup() {
  createCanvas(1280, 800);
  colorMode(RGB, 255, 255, 255, 1); 
  lastPaletteSwitch = millis();

  let generatedOrganisms = random(MIN_ORGANISMS, MAX_ORGANISMS);
  for (let i = 0; i < generatedOrganisms; i++) {
    organisms.push(new Organism());
  }

  for (let i = 0; i < FOG_PARTICLE_COUNT; i++) {
    fogParticles.push(new AtmosphericFog());
  }
}

// --- Main Render Loop ---

function draw() {
  if (millis() - lastPaletteSwitch > 4500) {
    activePaletteIndex = (activePaletteIndex + 1) % palettes.length;
    lastPaletteSwitch = millis();
  }
  let currentPalette = palettes[activePaletteIndex];

  blendMode(BLEND);
  background(3, 3, 8, 0.12); 

  flowTime += 0.0015;

  for (let fog of fogParticles) {
    fog.update(flowTime);
    fog.draw(currentPalette);
  }

  if (frameCount % 25 === 0) { 
    let x = random(width);
    let r = random(20, 75); 
    let y = height + (r * 2); 
    
    let speedX = map(r, 20, 75, -0.1, 0.6) * random([-1, 1]); 
    let speedY = map(r, 20, 75, -0.8, -2.5); 

    bubbles.push(new Bubble(x, y, r, speedX, speedY, currentPalette));
  }

  for (let org of organisms) {
    org.update(flowTime);
  }

  blendMode(ADD);

  for (let org of organisms) {
    org.drawMembrane(currentPalette);
  }

  drawDynamicLinks(); 

  for (let org of organisms) {
    org.draw(currentPalette);
  }

  for (let i = bubbles.length - 1; i >= 0; i--) {
    bubbles[i].update();
    bubbles[i].display();

    if (bubbles[i].isFinished()) {
      bubbles.splice(i, 1);
    }
  }
  
  blendMode(BLEND);
  drawScanlines();
}

// --- Entity Definitions ---

class Organism {
  constructor() {
    this.centerX = random(width * 0.1, width * 0.9);
    this.vx = random(-0.3, 0.3);
    this.noiseSeed = random(10000);
    this.depth = random(0.2, 0.9);
    this.particles = [];
    
    let particleCount = Math.floor(map(this.depth, 0, 1, 15, 40));
    for (let i = 0; i < particleCount; i++) {
      this.particles.push(new OrganismParticle(this.depth, this));
    }
  }

  update(time) {
    let n = noise(this.noiseSeed, time * 0.015);
    let drift = map(n, 0.2, 0.8, -0.2, 0.2, true);
    
    this.vx += drift;
    
    // 💡 [핵심 수정] 양쪽 끝으로 쏠리는 현상을 물리적으로 복원하는 '중앙 인력 제어'
    // 화면 중심(width/2)에서 멀어질수록 반대 방향으로 서서히 부드러운 힘을 가합니다.
    let centerDist = this.centerX - (width / 2);
    let gravityForce = centerDist * -0.0008; // 중심에서 멀어질수록 강하게 당김
    this.vx += gravityForce;
    
    this.vx = constrain(this.vx, -1.2, 1.2); 
    this.centerX += this.vx;
    
    // 경계 제어 마진 확보 및 마찰 계수 부여
    if (this.centerX < width * 0.05) {
      this.centerX = width * 0.05;
      this.vx *= -0.5; // 속도를 줄이며 튕김
    } else if (this.centerX > width * 0.95) {
      this.centerX = width * 0.95;
      this.vx *= -0.5;
    }

    for (let p of this.particles) {
      let scale = map(this.depth, 0, 1, 0.002, 0.0008); 
      let nVal = noise(p.pos.x * scale, p.pos.y * scale, time + p.individualSeed);
      
      let angle = map(nVal, 0.15, 0.85, -PI * 0.75, -PI * 0.25, true); 
      let force = p5.Vector.fromAngle(angle).mult(map(this.depth, 0, 1, 0.01, 0.05));
      p.update(force);
    }
  }

  drawMembrane(palette) {
    if (this.particles.length < 3) return;
    let points = this.particles.map(p => p.pos).filter(pos => pos.y < height && pos.y > 0);
    if (points.length < 5) return;

    let baseColor = color(contourColor(0.3, palette));
    let alphaFade = sin(PI * (this.particles[0].age / this.particles[0].life));
    let membraneAlpha = map(this.depth, 0, 1, 0.02, 0.15) * max(0, alphaFade);

    stroke(red(baseColor), green(baseColor), blue(baseColor), membraneAlpha);
    strokeWeight(map(this.depth, 0, 1, 1.5, 4.0));
    fill(red(baseColor), green(baseColor), blue(baseColor), membraneAlpha * 0.15);

    beginShape();
    for (let i = 0; i < points.length; i += 3) {
      curveVertex(points[i].x, points[i].y);
    }
    curveVertex(points[0].x, points[0].y);
    curveVertex(points[1].x, points[1].y);
    endShape();
  }

  draw(palette) {
    for (let p of this.particles) {
      p.draw(palette);
    }
  }
}

class OrganismParticle {
  constructor(depthLayer, parentOrganism) {
    this.parent = parentOrganism;
    this.depth = depthLayer;
    this.individualSeed = random(500); 
    this.reset();
    this.pos.y = random(0, height);
  }

  reset() {
    let spawnWidth = map(this.depth, 0, 1, 200, 80);
    this.pos = createVector(
      constrain(this.parent.centerX + random(-spawnWidth, spawnWidth), 20, width - 20), 
      height + random(50, 300)
    );
    this.vel = createVector(0, map(this.depth, 0, 1, -0.2, -0.9));
    this.acc = createVector(0, 0);
    this.maxSpeed = map(this.depth, 0, 1, 0.8, 2.5);
    this.age = 0;
    this.life = random(600, 1200);
    this.size = map(this.depth, 0, 1, 4, 12);
  }

  update(flowVector) {
    this.age++;
    let upwardBias = createVector(0, map(this.depth, 0, 1, -0.01, -0.03));
    this.acc.add(flowVector);
    this.acc.add(upwardBias);
    
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0);

    if (this.pos.y < -50 || this.age > this.life || this.pos.x < -150 || this.pos.x > width + 150) {
      this.reset();
    }
  }

  draw(palette) {
    let alphaFade = sin(PI * (this.age / this.life));
    let baseAlpha = map(this.depth, 0, 1, 0.1, 0.6) * alphaFade;

    let colGlow = color(contourColor(0.4, palette));
    let colCore = color(contourColor(0.8, palette));

    noStroke();
    fill(red(colGlow), green(colGlow), blue(colGlow), baseAlpha * 0.2);
    ellipse(this.pos.x, this.pos.y, this.size * 3.0);
    
    fill(red(colCore), green(colCore), blue(colCore), baseAlpha * 0.8);
    ellipse(this.pos.x, this.pos.y, this.size);
  }
}

class Bubble {
  constructor(x, y, r, speedX, speedY, palette) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.speedX = speedX;
    this.speedY = speedY;
    this.palette = palette;
    
    this.wobbleOffset = random(100);
    this.rotSpeed = random(-0.01, 0.01); 
    this.angle = random(TWO_PI);
    this.lifeAlpha = map(r, 20, 75, 0.7, 0.4); 

    this.particles = [];
    let numParticles = floor(map(this.r, 20, 75, 3, 7));
    for (let i = 0; i < numParticles; i++) {
      this.particles.push(new MicroParticle(this));
    }
  }

  getTopFade() {
    if (this.y < 300) {
      return pow(map(this.y, 300, -this.r * 0.2, 1.0, 0.0, true), 2.5);
    }
    return 1.0;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.angle += this.rotSpeed; 
    
    let fadeSpeed = map(this.r, 20, 75, 0.0012, 0.0006);
    this.lifeAlpha -= fadeSpeed; 

    // 벽면 통과 재생성 구조로 버블의 쏠림 현상 최종 방어
    if (this.x < -this.r) this.x = width + this.r;
    if (this.x > width + this.r) this.x = -this.r;

    for (let p of this.particles) {
      p.update();
    }
  }

  display() {
    let topFade = this.getTopFade();
    let finalAlpha = this.lifeAlpha * topFade;
    if (finalAlpha <= 0) return;

    for (let p of this.particles) {
      p.display(finalAlpha);
    }

    noFill();
    push();
    translate(this.x, this.y);
    rotate(this.angle);
    
    let wobble = sin(frameCount * 0.04 + this.wobbleOffset) * (this.r * 0.12);
    let currentW = this.r * 2 + wobble;
    let currentH = this.r * 2 - wobble;

    let layers = floor(map(this.r, 20, 75, 3, 6)); 
    
    for (let i = 0; i < layers; i++) {
      let strokeW = map(this.r, 20, 75, 1.5, 0.8) * map(i, 0, layers, 0.8, 2.2);
      strokeWeight(strokeW);
      
      let innerWobble = sin(frameCount * 0.04 + this.wobbleOffset + i * 0.25) * (this.r * 0.08);
      let w = (currentW * (i / layers)) + innerWobble;
      let h = (currentH * (i / layers)) - innerWobble;
      
      let t = map(i, 0, layers, 0.2, 0.9);
      let baseColor = color(contourColor(t, this.palette));
      let layerAlpha = finalAlpha * map(i, 0, layers, 0.2, 0.7);
      
      stroke(red(baseColor), green(baseColor), blue(baseColor), layerAlpha);
      ellipse(0, 0, w, h);
    }

    let outerColor = color(contourColor(0.8, this.palette));
    strokeWeight(0.6);
    stroke(red(outerColor), green(outerColor), blue(outerColor), finalAlpha * 0.15);
    ellipse(0, 0, currentW * 1.04, currentH * 1.04);

    pop();
  }

  isFinished() {
    return this.y < -this.r * 2 || this.lifeAlpha <= 0 || this.getTopFade() <= 0.01;
  }
}

class MicroParticle {
  constructor(parent) {
    this.parent = parent; 
    this.reset();
  }

  reset() {
    let angle = random(TWO_PI);
    let dist = random(this.parent.r * 0.1, this.parent.r * 0.7);
    this.ox = cos(angle) * dist; 
    this.oy = sin(angle) * dist; 
    this.noiseSeedX = random(1000);
    this.noiseSeedY = random(1000);
    this.size = random(1.5, 4.0);
    this.life = 1.0;
    this.fadeSpeed = random(0.015, 0.035);
  }

  update() {
    this.ox += (noise(this.noiseSeedX + frameCount * 0.02) - 0.5) * 1.4;
    this.oy += (noise(this.noiseSeedY + frameCount * 0.02) - 0.4) * 1.4 - 0.2; 
    this.life -= this.fadeSpeed;
    if (this.life <= 0) this.reset(); 
  }

  display(parentAlpha) {
    let px = this.parent.x + this.ox;
    let py = this.parent.y + this.oy;
    let pColor = color(contourColor(0.7, this.parent.palette));
    let pAlpha = parentAlpha * this.life * 0.5;
    
    if (pAlpha > 0) {
      noStroke();
      fill(red(pColor), green(pColor), blue(pColor), pAlpha);
      ellipse(px, py, this.size);
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
    this.vel = createVector(random(-0.1, 0.1), random(-0.1, -0.3));
    this.size = random(100, 300);
    this.noiseScale = random(0.0004, 0.0012);
    this.density = random(0.005, 0.018);
  }

  update(time) {
    let n = noise(this.pos.x * this.noiseScale, this.pos.y * this.noiseScale, time * 0.4);
    let angle = map(n, 0.2, 0.8, -PI * 0.7, -PI * 0.3, true);
    let flow = p5.Vector.fromAngle(angle).mult(0.015);
    
    this.vel.add(flow);
    this.vel.limit(0.4);
    this.pos.add(this.vel);

    if (this.pos.y < -this.size || this.pos.x < -this.size || this.pos.x > width + this.size) {
      this.reset();
    }
  }

  draw(palette) {
    let baseColor = color(contourColor(0.2, palette));
    noStroke();
    fill(red(baseColor), green(baseColor), blue(baseColor), this.density);
    ellipse(this.pos.x, this.pos.y, this.size);
  }
}

function drawDynamicLinks() {
  let maxDist = 220; 
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      let b1 = bubbles[i];
      let b2 = bubbles[j];
      let d = dist(b1.x, b1.y, b2.x, b2.y);
      
      if (d < maxDist) {
        let alpha1 = b1.lifeAlpha * b1.getTopFade();
        let alpha2 = b2.lifeAlpha * b2.getTopFade();
        let minAlpha = min(alpha1, alpha2);
        
        if (minAlpha > 0.05) {
          let proximityFade = map(d, 0, maxDist, 1.0, 0.0);
          let linkAlpha = minAlpha * proximityFade * 0.18; 
          
          let c1 = color(contourColor(0.5, b1.palette));
          let c2 = color(contourColor(0.5, b2.palette));
          let linkColor = lerpColor(c1, c2, 0.5);
          
          strokeWeight(map(d, 0, maxDist, 1.0, 0.1));
          stroke(red(linkColor), green(linkColor), blue(linkColor), linkAlpha);
          line(b1.x, b1.y, b2.x, b2.y);
        }
      }
    }
  }
}

function contourColor(t, palette) {
  let seg = palette.length - 1;
  let scaled = t * seg;
  let i = floor(scaled);
  let f = scaled - i;
  i = constrain(i, 0, palette.length - 2);
  return lerpColor(color(palette[i]), color(palette[i + 1]), f);
}

function drawScanlines() {
  push();
  resetMatrix();
  stroke(255, 255, 255, 0.015); 
  strokeWeight(1);
  for (let y = 0; y < height; y += 4) {
    line(0, y, width, y);
  }
  pop();
}