package routing

import (
	"container/heap"
	"errors"
	"fmt"
	"math"
)

// ErrUnreachable is returned when no path exists between the two nodes.
var ErrUnreachable = errors.New("campusgraph: destination unreachable")

// PathResult describes a route found by AStar.
type PathResult struct {
	Path     []int32 // node ids from src to dst, inclusive
	Cost     float64 // sum of current Weights along Path
	Expanded int     // number of nodes expanded (a measure of search effort)
}

func (g *Graph) MinCostPerPixel() (float64, error) {
	c := math.Inf(1)
	for e, w := range g.Weights {
		if w < 0 || math.IsNaN(w) {
			return 0, fmt.Errorf("campusgraph: edge %d has invalid weight %v", e, w)
		}
		u, v := g.Edges[e][0], g.Edges[e][1]
		l := math.Hypot(g.X[u]-g.X[v], g.Y[u]-g.Y[v])
		if l == 0 {
			continue // a zero-length edge adds no straight-line distance, so it can't break the bound
		}
		if r := w / l; r < c {
			c = r
		}
	}
	if math.IsInf(c, 1) {
		c = 0 // no edges with length: fall back to Dijkstra
	}
	return c, nil
}

func (g *Graph) AStar(src, dst int32) (PathResult, error) {
	scale, err := g.MinCostPerPixel()
	if err != nil {
		return PathResult{}, err
	}
	return g.AStarWithScale(src, dst, scale)
}

func (g *Graph) AStarWithScale(src, dst int32, scale float64) (PathResult, error) {
	n := int32(g.NumNodes())
	if src < 0 || src >= n || dst < 0 || dst >= n {
		return PathResult{}, fmt.Errorf("campusgraph: node out of range (src=%d, dst=%d, n=%d)", src, dst, n)
	}
	if scale < 0 || math.IsNaN(scale) || math.IsInf(scale, 0) {
		return PathResult{}, fmt.Errorf("campusgraph: invalid heuristic scale %v", scale)
	}

	gx, gy := g.X[dst], g.Y[dst]
	h := func(v int32) float64 { return scale * math.Hypot(g.X[v]-gx, g.Y[v]-gy) }

	gScore := make([]float64, n)
	prev := make([]int32, n)
	closed := make([]bool, n)
	for i := range gScore {
		gScore[i] = math.Inf(1)
		prev[i] = -1
	}
	gScore[src] = 0

	open := &astarHeap{{node: src, g: 0, f: h(src)}}
	expanded := 0

	for open.Len() > 0 {
		it := heap.Pop(open).(astarItem)
		u := it.node
		if closed[u] || it.g > gScore[u] {
			continue // stale entry: u was already reached more cheaply
		}
		if u == dst {
			return PathResult{Path: reconstruct(prev, dst), Cost: gScore[dst], Expanded: expanded}, nil
		}
		closed[u] = true
		expanded++

		for k := g.Indptr[u]; k < g.Indptr[u+1]; k++ {
			v := g.Indices[k]
			if closed[v] {
				continue // with a consistent heuristic, closed nodes are final
			}
			w := g.Weights[g.EdgeID[k]]
			if w < 0 || math.IsNaN(w) {
				return PathResult{}, fmt.Errorf("campusgraph: edge %d has invalid weight %v", g.EdgeID[k], w)
			}
			if t := gScore[u] + w; t < gScore[v] {
				gScore[v] = t
				prev[v] = u
				heap.Push(open, astarItem{node: v, g: t, f: t + h(v)})
			}
		}
	}
	return PathResult{Expanded: expanded}, ErrUnreachable
}

func reconstruct(prev []int32, dst int32) []int32 {
	var p []int32
	for v := dst; v != -1; v = prev[v] {
		p = append(p, v)
	}
	for i, j := 0, len(p)-1; i < j; i, j = i+1, j-1 {
		p[i], p[j] = p[j], p[i]
	}
	return p
}

type astarItem struct {
	node int32
	g    float64 // cost from src when pushed
	f    float64 // g + h
}

type astarHeap []astarItem

const tieEps = 1e-9

func (q astarHeap) Len() int { return len(q) }

func (q astarHeap) Less(i, j int) bool {
	if d := q[i].f - q[j].f; d < -tieEps || d > tieEps {
		return d < 0
	}
	return q[i].g > q[j].g
}

func (q astarHeap) Swap(i, j int)       { q[i], q[j] = q[j], q[i] }
func (q *astarHeap) Push(x interface{}) { *q = append(*q, x.(astarItem)) }
func (q *astarHeap) Pop() interface{} {
	old := *q
	it := old[len(old)-1]
	*q = old[:len(old)-1]
	return it
}