import './styles.css';
import { GridMap } from './core/GridMap.js';
import { CanvasRenderer } from './render/CanvasRenderer.js';
import { GameState } from './simulation/GameState.js';

const canvas = document.querySelector('#game-canvas');
const status = document.querySelector('#game-status');
const gridMap = new GridMap({ width: 20, height: 20 });
const gameState = new GameState({ gridMap });
const renderer = new CanvasRenderer(canvas);

renderer.render(gameState);
status.textContent = '20 × 20 타일 맵 기반을 준비했습니다.';
