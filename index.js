// const Matter = require('matter-js');

function mulberry32(a) {
	return function() {
		let t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

const rand = mulberry32(Date.now());

const {
	Engine, Render, Runner, Composites, Common, MouseConstraint, Mouse,
	Composite, Bodies, Events,
} = Matter;

const wallPad = 64;
const loseHeight = 84;
const statusBarHeight = 84;
const previewBallHeight = 64;
const friction = {
	friction: 0.006,
	frictionStatic: 0.006,
	frictionAir: 0,
	restitution: 0.1
};

const GameStates = {
	MENU: 0,
	READY: 1,
	DROP: 2,
	LOSE: 3,
};

const Game = {
	width: 640,
	height: 960,
	elements: {
		canvas: document.getElementById('game-canvas'),
		ui: document.getElementById('game-ui'),
		menu: document.getElementById('menu-layer'),
		startButton: document.getElementById('btn-start'),
		restartButton: document.getElementById('btn-restart'),
		score: document.getElementById('game-score'),
		end: document.getElementById('game-end-container'),
		endPanel: document.getElementById('game-end'),
		endTitle: document.getElementById('game-end-title'),
		endScore: document.getElementById('game-end-score'),
		statusValue: document.getElementById('game-highscore-value'),
		nextFruitImg: document.getElementById('game-next-fruit'),
		nextOrb: document.querySelector('.next-orb'),
		aimLine: document.getElementById('aim-line'),
		dangerLine: document.getElementById('danger-line'),
		previewBall: null,
	},
	cache: { highscore: 0 },
	started: false,
	scoreBumpTimer: null,
	sounds: {
		click: new Audio('./assets/click.mp3'),
		pop0: new Audio('./assets/pop0.mp3'),
		pop1: new Audio('./assets/pop1.mp3'),
		pop2: new Audio('./assets/pop2.mp3'),
		pop3: new Audio('./assets/pop3.mp3'),
		pop4: new Audio('./assets/pop4.mp3'),
		pop5: new Audio('./assets/pop5.mp3'),
		pop6: new Audio('./assets/pop6.mp3'),
		pop7: new Audio('./assets/pop7.mp3'),
		pop8: new Audio('./assets/pop8.mp3'),
		pop9: new Audio('./assets/pop9.mp3'),
		pop10: new Audio('./assets/pop10.mp3'),
	},

	stateIndex: GameStates.MENU,

	score: 0,
	fruitsMerged: [],
	playSound: function (name) {
		const sound = Game.sounds[name];
		if (!sound) return;

		try {
			const playback = sound.play();
			if (playback && typeof playback.catch === 'function') {
				playback.catch(() => {});
			}
		} catch (error) {
			// Audio is optional; ignore autoplay restrictions.
		}
	},
	calculateScore: function () {
		const score = Game.fruitsMerged.reduce((total, count, sizeIndex) => {
			const value = Game.fruitSizes[sizeIndex].scoreValue * count;
			return total + value;
		}, 0);

		const gained = score !== Game.score;
		Game.score = score;
		Game.elements.score.innerText = score.toLocaleString('en-US');

		if (gained && score > 0) {
			clearTimeout(Game.scoreBumpTimer);
			Game.elements.score.classList.remove('is-bump');
			void Game.elements.score.offsetWidth;
			Game.elements.score.classList.add('is-bump');
			Game.scoreBumpTimer = setTimeout(() => {
				Game.elements.score.classList.remove('is-bump');
			}, 320);
		}
	},

	fruitSizes: [
		{ radius: 24,  scoreValue: 1,  img: './assets/img/circle0.png'  },
		{ radius: 32,  scoreValue: 3,  img: './assets/img/circle1.png'  },
		{ radius: 40,  scoreValue: 6,  img: './assets/img/circle2.png'  },
		{ radius: 56,  scoreValue: 10, img: './assets/img/circle3.png'  },
		{ radius: 64,  scoreValue: 15, img: './assets/img/circle4.png'  },
		{ radius: 72,  scoreValue: 21, img: './assets/img/circle5.png'  },
		{ radius: 84,  scoreValue: 28, img: './assets/img/circle6.png'  },
		{ radius: 96,  scoreValue: 36, img: './assets/img/circle7.png'  },
		{ radius: 128, scoreValue: 45, img: './assets/img/circle8.png'  },
		{ radius: 160, scoreValue: 55, img: './assets/img/circle9.png'  },
		{ radius: 192, scoreValue: 66, img: './assets/img/circle10.png' },
	],
	currentFruitSize: 0,
	nextFruitSize: 0,
	setNextFruitSize: function () {
		Game.nextFruitSize = Math.floor(rand() * 5);
		Game.elements.nextFruitImg.src = `./assets/img/circle${Game.nextFruitSize}.png`;

		if (Game.elements.nextOrb) {
			Game.elements.nextOrb.classList.remove('is-pop');
			void Game.elements.nextOrb.offsetWidth;
			Game.elements.nextOrb.classList.add('is-pop');
		}
	},

	showHighscore: function () {
		Game.elements.statusValue.innerText = Game.cache.highscore.toLocaleString('en-US');
	},
	loadHighscore: function () {
		const gameCache = localStorage.getItem('suika-game-cache');
		if (gameCache === null) {
			Game.saveHighscore();
			return;
		}

		Game.cache = JSON.parse(gameCache);
		Game.showHighscore();
	},
	saveHighscore: function () {
		Game.calculateScore();
		Game.elements.endScore.innerText = Game.score.toLocaleString('en-US');

		if (Game.score < Game.cache.highscore) {
			Game.elements.endTitle.innerText = '游戏结束';
			Game.elements.endPanel.classList.remove('is-record');
			return;
		}

		Game.cache.highscore = Game.score;
		Game.showHighscore();
		Game.elements.endTitle.innerText = '新纪录！';
		Game.elements.endPanel.classList.add('is-record');

		localStorage.setItem('suika-game-cache', JSON.stringify(Game.cache));
	},

	initGame: function () {
		Render.run(render);
		Runner.run(runner, engine);

		Composite.add(engine.world, menuStatics);

		Game.loadHighscore();
		Game.fruitsMerged = Array.apply(null, Array(Game.fruitSizes.length)).map(() => 0);

		Game.elements.startButton.addEventListener('click', Game.startGame);
		Game.elements.restartButton.addEventListener('click', () => window.location.reload());

		Game.updateAimLine(Game.width / 2);
	},

	updateAimLine: function (x) {
		const previewBall = Game.elements.previewBall;
		const aimLine = Game.elements.aimLine;
		if (!previewBall || !aimLine) return;

		const r = previewBall.circleRadius;
		const lineX = Math.max(r, Math.min(Game.width - r, x));
		const top = previewBall.position.y + r + 6;

		aimLine.style.left = `${lineX}px`;
		aimLine.style.top = `${top}px`;
		aimLine.style.height = `${Math.max(0, Game.height - statusBarHeight - top)}px`;
	},

	getSpawnY: function (sizeIndex) {
		return Math.max(previewBallHeight, Game.fruitSizes[sizeIndex].radius + 8);
	},

	startGame: function () {
		if (Game.started) return;
		Game.started = true;

		Game.playSound('click');

		Composite.remove(engine.world, menuStatics);
		Composite.add(engine.world, gameStatics);

		Game.calculateScore();
		Game.elements.endTitle.innerText = '游戏结束';
		Game.elements.endPanel.classList.remove('is-record');
		Game.elements.endScore.innerText = '0';
		Game.elements.end.style.display = 'none';
		Game.elements.ui.classList.add('is-playing');
		Game.elements.previewBall = Game.generateFruitBody(Game.width / 2, Game.getSpawnY(0), 0, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 }
		});
		Composite.add(engine.world, Game.elements.previewBall);
		Game.updateAimLine(Game.width / 2);

		setTimeout(() => {
			Game.stateIndex = GameStates.READY;
		}, 250);

		Events.on(mouseConstraint, 'mouseup', function (e) {
			Game.addFruit(e.mouse.position.x);
		});

		Events.on(mouseConstraint, 'mousemove', function (e) {
			if (Game.stateIndex === GameStates.LOSE) return;
			if (Game.elements.previewBall === null) return;

			const r = Game.elements.previewBall.circleRadius;
			const x = Math.max(r, Math.min(Game.width - r, e.mouse.position.x));

			Game.elements.previewBall.position.x = x;
			Game.updateAimLine(x);
		});

		Events.on(engine, 'collisionStart', function (e) {
			for (let i = 0; i < e.pairs.length; i++) {
				const { bodyA, bodyB } = e.pairs[i];

				// Skip if collision is wall
				if (bodyA.isStatic || bodyB.isStatic) continue;

				const aY = bodyA.position.y + bodyA.circleRadius;
				const bY = bodyB.position.y + bodyB.circleRadius;

				// Uh oh, too high!
				if (aY < loseHeight || bY < loseHeight) {
					Game.loseGame();
					return;
				}

				// Skip different sizes
				if (bodyA.sizeIndex !== bodyB.sizeIndex) continue;

				// Skip if already popped
				if (bodyA.popped || bodyB.popped) continue;

				let newSize = bodyA.sizeIndex + 1;

				// Go back to smallest size
				if (bodyA.circleRadius >= Game.fruitSizes[Game.fruitSizes.length - 1].radius) {
					newSize = 0;
				}

				Game.fruitsMerged[bodyA.sizeIndex] += 1;

				// Therefore, circles are same size, so merge them.
				const midPosX = (bodyA.position.x + bodyB.position.x) / 2;
				const midPosY = (bodyA.position.y + bodyB.position.y) / 2;

				bodyA.popped = true;
				bodyB.popped = true;

				Game.playSound(`pop${bodyA.sizeIndex}`);
				Composite.remove(engine.world, [bodyA, bodyB]);
				Composite.add(engine.world, Game.generateFruitBody(midPosX, midPosY, newSize));
				Game.addPop(midPosX, midPosY, bodyA.circleRadius);
				Game.calculateScore();
			}
		});
	},

	addPop: function (x, y, r) {
		const circle = Bodies.circle(x, y, r, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 },
			angle: rand() * (Math.PI * 2),
			render: {
				sprite: {
					texture: './assets/img/pop.png',
					xScale: r / 384,
					yScale: r / 384,
				}
			},
		});

		Composite.add(engine.world, circle);
		setTimeout(() => {
			Composite.remove(engine.world, circle);
		}, 100);
	},

	loseGame: function () {
		if (Game.stateIndex === GameStates.LOSE) return;

		Game.stateIndex = GameStates.LOSE;
		Game.elements.ui.classList.add('is-lost');
		Game.elements.end.style.display = 'flex';
		runner.enabled = false;
		Game.saveHighscore();
	},

	// Returns an index, or null
	lookupFruitIndex: function (radius) {
		const sizeIndex = Game.fruitSizes.findIndex(size => size.radius == radius);
		if (sizeIndex === undefined) return null;
		if (sizeIndex === Game.fruitSizes.length - 1) return null;

		return sizeIndex;
	},

	generateFruitBody: function (x, y, sizeIndex, extraConfig = {}) {
		const size = Game.fruitSizes[sizeIndex];
		const circle = Bodies.circle(x, y, size.radius, {
			...friction,
			...extraConfig,
			render: { sprite: { texture: size.img, xScale: size.radius / 512, yScale: size.radius / 512 } },
		});
		circle.sizeIndex = sizeIndex;
		circle.popped = false;

		return circle;
	},

	addFruit: function (x) {
		if (Game.stateIndex !== GameStates.READY) return;

		Game.playSound('click');

		const radius = Game.fruitSizes[Game.currentFruitSize].radius;
		const dropX = Math.max(radius, Math.min(Game.width - radius, x));
		const dropY = Game.getSpawnY(Game.currentFruitSize);

		Game.stateIndex = GameStates.DROP;
		const latestFruit = Game.generateFruitBody(dropX, dropY, Game.currentFruitSize);
		Composite.add(engine.world, latestFruit);

		Game.currentFruitSize = Game.nextFruitSize;
		Game.setNextFruitSize();
		Game.calculateScore();

		Composite.remove(engine.world, Game.elements.previewBall);

		const nextRadius = Game.fruitSizes[Game.currentFruitSize].radius;
		const nextX = Math.max(nextRadius, Math.min(Game.width - nextRadius, render.mouse.position.x));
		Game.elements.previewBall = Game.generateFruitBody(nextX, Game.getSpawnY(Game.currentFruitSize), Game.currentFruitSize, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 }
		});
		Game.updateAimLine(nextX);

		setTimeout(() => {
			if (Game.stateIndex === GameStates.DROP) {
				Composite.add(engine.world, Game.elements.previewBall);
				Game.stateIndex = GameStates.READY;
			}
		}, 500);
	}
}

const engine = Engine.create();
const runner = Runner.create();
const render = Render.create({
	element: Game.elements.canvas,
	engine,
	options: {
		width: Game.width,
		height: Game.height,
		wireframes: false,
		background: 'transparent'
	}
});

const menuStatics = [];

const wallProps = {
	isStatic: true,
	render: { fillStyle: '#FFEEDB' },
	...friction,
};

const gameStatics = [
	// Left
	Bodies.rectangle(-(wallPad / 2), Game.height / 2, wallPad, Game.height, wallProps),

	// Right
	Bodies.rectangle(Game.width + (wallPad / 2), Game.height / 2, wallPad, Game.height, wallProps),

	// Bottom
	Bodies.rectangle(Game.width / 2, Game.height + (wallPad / 2) - statusBarHeight, Game.width, wallPad, wallProps),
];

// add mouse control
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
	mouse: mouse,
	constraint: {
		stiffness: 0.2,
		render: {
			visible: false,
		},
	},
});
render.mouse = mouse;

Game.initGame();

const resizeCanvas = () => {
	const isCompact = window.matchMedia('(max-width: 720px)').matches;
	const padding = isCompact ? 10 : 24;
	const viewportWidth = Math.max(0, document.documentElement.clientWidth - padding);
	const viewportHeight = Math.max(0, document.documentElement.clientHeight - padding);
	const scale = Math.min(viewportWidth / Game.width, viewportHeight / Game.height, 1);

	const newWidth = Game.width * scale;
	const newHeight = Game.height * scale;

	render.canvas.style.width = `${newWidth}px`;
	render.canvas.style.height = `${newHeight}px`;

	Game.elements.ui.style.width = `${Game.width}px`;
	Game.elements.ui.style.height = `${Game.height}px`;
	Game.elements.ui.style.transform = `scale(${scale})`;

	if (Game.elements.dangerLine) {
		Game.elements.dangerLine.style.top = `${loseHeight * scale}px`;
		Game.elements.dangerLine.style.setProperty('--ui-scale', scale);
	}
};

resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
window.addEventListener('load', resizeCanvas);
