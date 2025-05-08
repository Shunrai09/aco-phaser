import { JITTER, SPEED_RANGE, DURATION_FACTOR } from '../config/constants';
import { ONE_WAY_STREETS, BLOCKED_STREETS } from '../config/traffic';

export class Ant {

  constructor(startIndex, targetIndex, nodes, scene, color) {
    this.scene = scene;
    this.current = startIndex;
    this.target = targetIndex;
    this.path = [startIndex];
    this.totalDistance = 0;
    this.nodes = nodes;
    this.color = color;
    this.arrived = false;
    this.isMoving = false;
    this.counted = false;
    this.isStuck = false;
    this.stuckTimer = 0;
    this.maxStuckTime = 2000;
    this.speed = Phaser.Math.FloatBetween(...SPEED_RANGE);
    

    const { x, y } = nodes[startIndex];
    this.sprite = scene.add.circle(
      x + Phaser.Math.Between(-JITTER, JITTER),
      y + Phaser.Math.Between(-JITTER, JITTER),
      5,
      color
    );
  }

  tryMove(ctx) {
    if (this.arrived || this.isMoving || this.isStuck) {
        if (this.isStuck) {
            this.stuckTimer -= ctx.time.delta;
            if (this.stuckTimer <= 0) this.isStuck = false;
        }
        return;
    }

    // Obtener el nodo anterior (para evitar retroceso inmediato)
    const previousNode = this.path.length > 1 ? this.path[this.path.length - 2] : null;
    console.log(`[Hormiga] Nodo actual: ${this.current} | Anterior: ${previousNode || 'Ninguno'}`);

    // 1. Obtener vecinos directos
    const neighbors = ctx.edges
        .filter(([u, v]) => u === this.current || v === this.current)
        .map(([u, v]) => (u === this.current ? v : u));

    console.log(`[Hormiga] Vecinos posibles: ${neighbors.join(', ')}`);

    // 2. Filtrar por reglas de movimiento
    const BLOCKED_STREETS = [
        "48-49", "49-48",  // Calle entre nodo 48 y 49
        "48-50", "50-48",  // Calle entre nodo 48 y 50
        "50-51", "51-50",  // Calle entre nodo 50 y 51
        "51-52", "52-51"   // Calle entre nodo 51 y 52
    ];

    const validNeighbors = neighbors.filter(n => {
        const edgeKey = `${Math.min(this.current, n)}-${Math.max(this.current, n)}`;
        const reverseEdgeKey = `${Math.max(this.current, n)}-${Math.min(this.current, n)}`;

        // Verificar si la calle está bloqueada
        if (BLOCKED_STREETS.includes(edgeKey) || BLOCKED_STREETS.includes(reverseEdgeKey)) {
            console.log(`[Hormiga] ↳ Bloqueado: Calle ${edgeKey} está bloqueada`);
            return false;  // No permitir movimiento por esta calle
        }

        // Regla 1: Calles unidireccionales
        if (ONE_WAY_STREETS[edgeKey]) {
            const allowed = this.current === Math.min(this.current, n);
            if (!allowed) console.log(`[Hormiga] ↳ Bloqueado: Calle ${edgeKey} es unidireccional`);
            return allowed;
        }

        // Regla 2: Semáforos
        if (ctx.specialEdges.has(edgeKey)) {
            if (ctx.edgeStates[edgeKey] === false) {
                console.log(`[Hormiga] ↳ Bloqueado: Semáforo en rojo (${edgeKey})`);
                return false;
            }
        }

        // Regla 3: Evitar solo el nodo anterior (no todo el path)
        if (n === previousNode) {
            console.log(`[Hormiga] ↳ Bloqueado: Retroceso a nodo anterior (${n})`);
            return false;
        }

        return true;
    });

    console.log(`[Hormiga] Vecinos válidos: ${validNeighbors.join(', ') || 'Ninguno'}`);

    // 3. Manejar casos sin movimientos válidos
    if (validNeighbors.length === 0) {
        console.log(`[Hormiga] No hay caminos válidos desde el nodo ${this.current}.`);
        return;
    }

    // 4. Selección del siguiente nodo
    const next = validNeighbors.length === 1
        ? validNeighbors[0]
        : ctx.selectNextNode(this, validNeighbors);

    console.log(`[Hormiga] Decisión: Moverse a ${next}`);

    // 5. Validación de seguridad
    if (!this.nodes[next]) {
        console.error(`[Hormiga] ERROR: Nodo ${next} no existe. Reiniciando...`);
        this.resetAnt();
        return;
    }

    // 6. Movimiento
    const dist = Phaser.Math.Distance.BetweenPoints(
        this.nodes[this.current],
        this.nodes[next]
    );
    this.moveTo(next, dist, ctx);
}


  moveTo(nextNodeIndex, distance, ctx) {
    this.isMoving = true;
    this.current = nextNodeIndex;
    this.path.push(nextNodeIndex);
    this.totalDistance += distance;

    if (nextNodeIndex === this.target) {
      this.arrived = true;
      this.sprite.setFillStyle(this.color);
      this.isMoving = false;
      return;
    }

    const { x, y } = this.nodes[nextNodeIndex];
    ctx.tweens.add({
      targets: this.sprite,
      x, y,
      duration: distance * DURATION_FACTOR * this.speed,
      ease: 'Linear',
      onComplete: () => this.isMoving = false
    });
  }
}
