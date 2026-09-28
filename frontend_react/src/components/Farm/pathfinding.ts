export interface Cell {x: number; y: number}
export const cellKey = (p: Cell) => `${p.x},${p.y}`;
export const plotCell = (id: string): Cell => ({x: 3 + Number(id)%4*2, y: 4 + Math.floor(Number(id)/4)*2});
export function findPath(start: Cell, end: Cell, blocked: Set<string>, width = 24, height = 16): Cell[] {
    const open = [start]; const came = new Map<string, Cell>(); const scores = new Map([[cellKey(start), 0]]);
    const h = (p: Cell) => Math.abs(p.x-end.x)+Math.abs(p.y-end.y);
    while (open.length) {
        open.sort((a,b) => (scores.get(cellKey(a))!+h(a))-(scores.get(cellKey(b))!+h(b)));
        const current = open.shift()!;
        if (cellKey(current) === cellKey(end)) {
            const path: Cell[] = []; let p = current;
            while (came.has(cellKey(p))) {path.unshift(p); p = came.get(cellKey(p))!;}
            return path;
        }
        for (const p of [{x: current.x+1,y:current.y},{x:current.x-1,y:current.y},{x:current.x,y:current.y+1},{x:current.x,y:current.y-1}]) {
            const k = cellKey(p); if (p.x<1 || p.y<1 || p.x>=width-1 || p.y>=height-1 || blocked.has(k)) continue;
            const score = scores.get(cellKey(current))!+1;
            if (score < (scores.get(k) ?? Infinity)) {came.set(k,current); scores.set(k,score); if (!open.some(c => cellKey(c)===k)) open.push(p);}
        }
    }
    return [];
}
