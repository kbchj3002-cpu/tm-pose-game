/**
 * gameEngine.js
 * Catch Zone 게임 로직 구현
 */

class GameEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;

    // 게임 상태
    this.gameState = 'READY'; // READY, PLAYING, GAMEOVER
    this.score = 0;
    this.level = 1;
    this.levelTime = 20; // 레벨 당 20초
    this.levelTimer = 0;

    this.missCount = 0; // 놓친 횟수
    this.maxMiss = 2;   // 2번 놓치면 게임오버

    // 바구니 상태
    this.basketZone = 1; // 0: LEFT, 1: CENTER, 2: RIGHT
    this.zones = ['LEFT', 'CENTER', 'RIGHT'];
    // 캔버스 크기 200기준 구역 중심점: 33.3, 100, 166.6
    this.zoneCenters = [33, 100, 167];

    // 아이템 상태
    this.items = [];
    this.spawnTimer = 0;
    this.dropTime = 2.0;    // 1단계 기준 2초 (화면 위->아래)

    // UI Timers
    this.warningTimer = 0;  // WARNING 표시 시간
    this.levelUpTimer = 0;  // Level Up 표시 시간
    this.lastTime = 0;

    // 아이템 정의
    this.itemTypes = [
      { name: 'bomb', icon: '💣', score: 0, isBomb: true },
      { name: 'apple', icon: '🍎', score: 100, isBomb: false },
      { name: 'pear', icon: '🍐', score: 150, isBomb: false },
      { name: 'orange', icon: '🍊', score: 200, isBomb: false }
    ];

    this.lastTime = 0;
  }

  init(ctx) {
    this.ctx = ctx;
    this.canvas = ctx.canvas;
    this.gameState = 'READY';
  }

  start() {
    this.gameState = 'PLAYING';
    this.score = 0;
    this.level = 1;
    this.missCount = 0;
    this.items = [];
    this.resetLevelParams();
    this.lastTime = performance.now();
  }

  stop() {
    this.gameState = 'READY';
  }

  resetLevelParams() {
    this.levelTime = 20;
    // 레벨 1: dropTime=2.0s. 레벨업마다 -0.2s. 최소 0.5s
    this.dropTime = Math.max(0.5, 2.0 - (this.level - 1) * 0.2);
    // 생성 간격은 dropTime의 60% ~ 80%
    // 여기서는 기준값을 잡고 update에서 랜덤 처리
    this.spawnTimer = 0;
  }

  // 예측된 포즈를 받아 바구니 위치 업데이트
  onPoseDetected(poseLabel) {
    if (this.gameState !== 'PLAYING') return;

    if (poseLabel === 'LEFT') this.basketZone = 0;
    if (poseLabel === 'CENTER') this.basketZone = 1;
    if (poseLabel === 'RIGHT') this.basketZone = 2;
  }

  // 메인 업데이트 루프 (매 프레임 호출)
  update() {
    if (this.gameState !== 'PLAYING') return;

    const now = performance.now();
    const dt = (now - this.lastTime) / 1000; // delta time in seconds
    this.lastTime = now;

    // 1. 레벨 타이머
    this.levelTime -= dt;
    if (this.levelTime <= 0) {
      this.level++;
      this.levelUpTimer = 2.0; // 2초간 표시
      this.resetLevelParams();
      // 게임 종료 없이 계속 진행
    }

    // UI Timers Update
    if (this.warningTimer > 0) this.warningTimer -= dt;
    if (this.levelUpTimer > 0) this.levelUpTimer -= dt;

    // 2. 아이템 생성
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnItem();
      // 다음 생성 시간 랜덤 (dropTime의 60% ~ 80%)
      const minRate = 0.6;
      const maxRate = 0.8;
      const rate = Math.random() * (maxRate - minRate) + minRate;
      this.spawnTimer = this.dropTime * rate;
    }

    // 3. 아이템 이동 및 충돌 처리
    // 화면 높이 200px 기준, 속도 = 200 / dropTime (px/s)
    const speed = 200 / this.dropTime;

    for (let i = this.items.length - 1; i >= 0; i--) {
      let item = this.items[i];
      item.y += speed * dt;

      // 바구니 판정 (바구니 y위치는 대략 160~180 근처라고 가정)
      // 여기서는 바닥(200)에 가까워졌을 때 구역 비교
      // 히트 박스: y > 160 && y < 190
      if (!item.collected && item.y > 160 && item.y < 180) {
        if (item.zone === this.basketZone) {
          // 획득!
          this.collectItem(item, i);
          continue; // 처리 후 루프 진행
        }
      }

      // 바닥 닿음 (Miss)
      if (item.y > 200) {
        if (!item.collected) {
          this.missItem(item);
        }
        this.items.splice(i, 1);
      }
    }
  }

  spawnItem() {
    // 1. 랜덤 구역 (0, 1, 2)
    const zone = Math.floor(Math.random() * 3);
    // 2. 랜덤 아이템 타입
    // 폭탄 확률 20%?
    const rand = Math.random();
    let typeIdx = 0; // default bomb
    if (rand < 0.2) typeIdx = 0; // Bomb
    else if (rand < 0.5) typeIdx = 1; // Apple
    else if (rand < 0.8) typeIdx = 2; // Pear
    else typeIdx = 3; // Orange

    const type = this.itemTypes[typeIdx];

    this.items.push({
      x: this.zoneCenters[zone],
      y: -20, // 화면 위에서 시작
      zone: zone,
      type: type,
      collected: false
    });
  }

  collectItem(item, index) {
    item.collected = true;
    this.items.splice(index, 1);

    if (item.type.isBomb) {
      this.gameOver();
    } else {
      this.score += item.type.score;
      // 효과음 등을 넣을 수 있음
    }
  }

  missItem(item) {
    if (item.type.isBomb) return; // 폭탄은 놓쳐도 됨

    this.missCount++;
    this.warningTimer = 2.0; // 2초간 경고 표시

    if (this.missCount >= this.maxMiss) {
      this.gameOver();
    }
  }

  gameOver() {
    this.gameState = 'GAMEOVER';
  }

  // 그리기 (기존 웹캠 위에 덮어그리기)
  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. 배경 그리기 (하늘색)
    ctx.fillStyle = '#87CEEB'; // Sky Blue
    ctx.fillRect(0, 0, 200, 200);

    // 구역 구분선
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(66, 0); ctx.lineTo(66, 200);
    ctx.moveTo(133, 0); ctx.lineTo(133, 200);
    ctx.stroke();

    if (this.gameState === 'READY') {
      this.drawText('Pose to Start!', 100, 100, 20, 'white');
      return;
    }

    // 2. 바구니 그리기
    const bx = this.zoneCenters[this.basketZone];
    const by = 170;
    this.drawEmoji('🧺', bx, by, 40);

    // 3. 아이템 그리기
    for (let item of this.items) {
      this.drawEmoji(item.type.icon, item.x, item.y, 30);
    }

    // 4. UI 그리기 (Score, Level, Miss)
    this.drawUI();

    // WARNING 표시 (Timer 기반)
    if (this.warningTimer > 0 && this.missCount === 1) {
      this.drawText('WARNING!', 100, 100, 30, 'red');
    }

    // LEVEL UP 표시
    if (this.levelUpTimer > 0) {
      this.drawText(`LEVEL UP!`, 100, 50, 24, 'blue');
      this.drawText(`Speed Up!`, 100, 70, 16, 'navy');
    }

    if (this.gameState === 'GAMEOVER') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, 200, 200);
      this.drawText('GAME OVER', 100, 80, 24, 'red');
      this.drawText(`Score: ${this.score}`, 100, 110, 16, 'white');
      this.drawText('Refresh to Restart', 100, 140, 12, 'gray');
    }
  }

  drawUI() {
    const ctx = this.ctx;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Sc: ${this.score}`, 5, 15);
    ctx.fillText(`Lv: ${this.level}`, 5, 30);

    // 남은 시간
    ctx.textAlign = 'right';
    ctx.fillText(`Time: ${Math.ceil(this.levelTime)}`, 195, 15);

    // Miss (Hearts)
    let hearts = '';
    const life = this.maxMiss - this.missCount; // 2, 1, 0
    // Life 2: ❤️❤️, Life 1: ❤️, Life 0: empty
    // Miss가 0이면 ❤️❤️, Miss 1이면 ❤️
    // maxMiss가 게임오버 기준이므로 life 개념으로 변환해서 보여줌
    // miss 0 -> 2 lives
    // miss 1 -> 1 life
    for (let i = 0; i < life; i++) hearts += '❤️';

    ctx.fillText(hearts, 195, 30);
  }

  drawEmoji(emoji, x, y, size) {
    const ctx = this.ctx;
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  drawText(text, x, y, size, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }
}

// 전역으로 내보내기
window.GameEngine = GameEngine;
