export function ensureConnectivity(nodes, edges) {
    const parent = nodes.map((_, i) => i);
    const find = u => { 
      while (parent[u] !== u) { 
        parent[u] = parent[parent[u]]; 
        u = parent[u]; 
      } 
      return u; 
    };
    
    const union = (u, v) => { 
      const ru = find(u), rv = find(v); 
      if (ru !== rv) parent[rv] = ru; 
    };
    
    edges.forEach(([u, v]) => union(u, v));
    const root = find(0);
    
    for (let i = 1; i < nodes.length; i++) {
      if (find(i) !== root) {
        let minD = Infinity, closest = 0;
        for (let j = 0; j < nodes.length; j++) {
          if (find(j) === root) {
            const sameX = Math.abs(nodes[j].x - nodes[i].x) < 5;
            const sameY = Math.abs(nodes[j].y - nodes[i].y) < 5;
            if (sameX || sameY) {
              const d = Phaser.Math.Distance.BetweenPoints(nodes[j], nodes[i]);
              if (d < minD) { minD = d; closest = j; }
            }
          }
        }
        if (minD < Infinity) { 
          edges.push([closest, i]); 
          union(closest, i); 
        }
      }
    }
    return edges;
  }
  

  