import Phaser from 'phaser';
import { Ant } from '../entities/Ant';
import {
  JITTER, SPEED_RANGE, DURATION_FACTOR,
  SPAWN_INTERVAL, CYCLE_INTERVAL, TRAFFIC_INTERVAL,
  ACO_PARAMS
} from '../config/constants';
import { COLONIES } from '../config/colonies';
import { NODES, SPECIAL_NODES } from '../config/nodes';
import { BASE_EDGES } from '../config/edges';
import { SPECIAL_EDGES, BLOCK_MAP } from '../config/traffic';
import { ensureConnectivity } from '../utils/helpers';

export class ACOScene extends Phaser.Scene {
  constructor() {
    super('ACOScene');

    // Parámetros ACO
    this.alpha = ACO_PARAMS.alpha;
    this.beta = ACO_PARAMS.beta;
    this.evaporationRate = ACO_PARAMS.evaporationRate;
    this.numAntsPerColony = ACO_PARAMS.numAntsPerColony;

    // Estructuras
    this.nodes = NODES;
    this.edges = [];
    this.pheromones = [];
    this.ants = [];

    // Colonias
    this.colonies = COLONIES;

    // Semáforos
    this.specialEdges = SPECIAL_EDGES;
    this.edgeStates = {};
    this.specialEdges.forEach(key => this.edgeStates[key] = true);
    this.specialEdgeTimers = {};
    this.blockMap = BLOCK_MAP;
  }

  preload() { }

  create() {
    this.graphics = this.add.graphics();

    this.setupNodes();
    this.setupEdges();
    this.initPheromones();
    this.setupColonies();
    this.createUI();
    this.startTimers();

    // alternar semáforos cada 10 segundos
    this.specialEdges.forEach(key => {
      this.specialEdgeTimers[key] = this.time.addEvent({
        delay: TRAFFIC_INTERVAL,
        loop: true,
        callback: () => {
          this.edgeStates[key] = !this.edgeStates[key];
        }
      });
    });
  }

  setupNodes() {
    this.nodes.forEach((n, i) => {
      this.add.circle(n.x, n.y, 8, SPECIAL_NODES[i] || 0xffffff);
      this.add.text(n.x - 5, n.y - 5, `${i}`, { font: '10px Arial', fill: '#000' });
    });
  }

  setupEdges() {

    this.edges = ensureConnectivity(this.nodes, this.edges);

    // Añadir aristas críticas
    BASE_EDGES.forEach(([i, j]) => {
      if (i < this.nodes.length && j < this.nodes.length &&
        !this.edges.some(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i))) {
        this.edges.push([i, j]);
      }
    });
  }

  initPheromones() {
    const N = this.nodes.length;
    this.pheromones = Array(N).fill().map(() => Array(N).fill(0.1));
    this.edges.forEach(([i, j]) => {
      const d = Phaser.Math.Distance.BetweenPoints(this.nodes[i], this.nodes[j]);
      this.pheromones[i][j] = this.pheromones[j][i] = 1 / d;
    });
  }

  setupColonies() {
    this.colonies.forEach((col, index) => {
      col.spawnCount = 0;
      col.arrivedCount = 0;
      col.text = this.add.text(
        20, 100 + 25 * index,
        `Colonia ${col.name}: 0/${this.numAntsPerColony}`,
        { font: '14px Arial', fill: Phaser.Display.Color.IntegerToColor(col.color).rgba }
      );
    });
  }

  createUI() {
    this.add.text(20, 20, 'ACO – Múltiples Colonias', { font: '16px Arial', fill: '#fff' });
    this.add.rectangle(700, 30, 150, 30, 0x333333)
      .setInteractive()
      .on('pointerdown', () => this.resetSimulation());
    this.add.text(625, 25, 'Reiniciar Simulación', { font: '14px Arial', fill: '#fff' });
  }

  startTimers() {
    this.colonies.forEach(col => {
      col.spawnEvent = this.time.addEvent({
        delay: SPAWN_INTERVAL,
        callback: () => this.spawnAnt(col),
        callbackScope: this,
        repeat: this.numAntsPerColony - 1
      });
    });
    this.time.addEvent({
      delay: CYCLE_INTERVAL,
      loop: true,
      callback: () => this.runCycle()
    });
  }

  resetSimulation() {
    this.ants.forEach(a => a.sprite.destroy());
    this.ants = [];
    this.graphics.clear();
    this.initPheromones();
    this.colonies.forEach(col => {
      col.spawnCount = col.arrivedCount = 0;
      col.text.setText(`Colonia ${col.name}: 0/${this.numAntsPerColony}`);
      col.spawnEvent.reset({ repeat: this.numAntsPerColony - 1, delay: SPAWN_INTERVAL });
    });
  }

  spawnAnt(colony) {
    const ant = new Ant(colony.start, colony.target, this.nodes, this, colony.color);
    this.ants.push(ant);
    colony.spawnCount++;
    colony.text.setText(`Colonia ${colony.name}: ${colony.arrivedCount}/${colony.spawnCount}`);
  }

  runCycle() {
    this.moveAnts();
    this.updatePheromones();
    this.renderPheromones();
  }

  moveAnts() {
    this.ants.forEach(ant => ant.tryMove(this));
  }

  selectNextNode(ant, neighbors) {
    if (!neighbors || neighbors.length === 0) return null;

    const previousNode = ant.path.length >= 2 ? ant.path[ant.path.length - 2] : null;
    let validNeighbors = neighbors.filter(n => {

      // Validar que el nodo existe
      if (n === undefined || n >= this.nodes.length) return false;

      // Evitar retroceso
      if (n === previousNode) return false;

      // Verificar aristas bloqueadas
      const edgeKey = `${Math.min(ant.current, n)}-${Math.max(ant.current, n)}`;
      if (this.specialEdges.has(edgeKey)) {
        return this.edgeStates[edgeKey];
      }

      return true;
    });

    // 4. Calcular probabilidades (feromonas + heurística)
    const probs = validNeighbors.map(n => {
      const pher = this.pheromones[ant.current][n];
      const heur = 1 / Phaser.Math.Distance.BetweenPoints(this.nodes[ant.current], this.nodes[n]);
      return Math.pow(pher, this.alpha) * Math.pow(heur, this.beta);
    });

    // 5. Selección probabilística
    const total = probs.reduce((s, p) => s + p, 0);
    let rnd = Math.random(), sum = 0;

    for (let i = 0; i < validNeighbors.length; i++) {
      sum += probs[i] / total;
      if (rnd <= sum) return validNeighbors[i];
    }

    return validNeighbors[validNeighbors.length - 1]; // Fallback
  }

  updatePheromones() {
    // evaporación
    this.edges.forEach(([i, j]) => {
      this.pheromones[i][j] *= this.evaporationRate;
      this.pheromones[j][i] *= this.evaporationRate;
    });

    // contar llegadas y refuerzo
    this.ants.forEach(ant => {
      if (ant.arrived && !ant.counted) {
        ant.counted = true;
        const col = this.colonies.find(c => c.start === ant.path[0]);
        if (col) {
          col.arrivedCount++;
          col.text.setText(`Colonia ${col.name}: ${col.arrivedCount}/${col.spawnCount}`);
        }
      }
      if (ant.arrived) {
        const pherAdd = 100 / ant.totalDistance;
        for (let k = 0; k < ant.path.length - 1; k++) {
          const u = ant.path[k], v = ant.path[k + 1];
          this.pheromones[u][v] += pherAdd;
          this.pheromones[v][u] += pherAdd;
        }
      }
    });
  }
  



  renderPheromones() {
    this.graphics.clear();
    const maxPheromone = Math.max(...this.edges.map(([i, j]) => this.pheromones[i][j]));

    // Definir las calles con mayor grosor (puedes agregar más según lo necesites)
    const thickerStreets = [
      "0-1", "0-11", "11-12", "12-13", "13-14", "14-15", "15-16", "16-17", "17-19", "18-19", "18-55", "10-55", "9-10", "8-9", "7-8", "6-7", "5-6", "4-5", "3-4", "2-3", "1-2"
    ];

    this.edges.forEach(([i, j]) => {
      const edgeKey = `${Math.min(i, j)}-${Math.max(i, j)}`;

      let color, width;

      // Si la arista es una de las "gruesas", asignamos el grosor y color correspondientes
      if (thickerStreets.includes(edgeKey)) {
        width = 6;  // Doble de gruesa (grosor base: 3 para las normales)
        color = 0xff7f00;  // Naranja para las calles gruesas
      } else {
        width = 3;  // Grosor base para las calles normales
        color = Phaser.Display.Color.GetColor(25, 100, 100);  // Amarillo para las calles normales
      }

      // Dibujar la línea de la arista
      this.graphics.lineStyle(width, color);
      this.graphics.lineBetween(
        this.nodes[i].x, this.nodes[i].y,
        this.nodes[j].x, this.nodes[j].y
      );
    });
  }


}

