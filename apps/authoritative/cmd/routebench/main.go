package main

// Benchmarks A* on the campus graph using random restaurant -> location queries.
// Sources are pickup (green) nodes; destinations are pickup or dropoff (green
// or blue) nodes other than the source.
//
// Usage (from apps/authoritative):
//
//	go run ./cmd/routebench -n 100000
import (
	"flag"
	"fmt"
	"log"
	"math/rand"
	"runtime"
	"slices"
	"time"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/routing"
)

func main() {
	graphPath := flag.String("graph", "internal/routing/data/campus_graph.npz", "path to the campus graph .npz")
	n := flag.Int("n", 100000, "number of timed queries")
	warmup := flag.Int("warmup", 1000, "number of untimed warmup queries")
	seed := flag.Int64("seed", 0, "random seed (0 = time-based)")
	flag.Parse()

	g, err := routing.Load(*graphPath)
	if err != nil {
		log.Fatalf("load graph: %v", err)
	}

	var sources, dests []int32
	for v, t := range g.NodeType {
		if t == routing.NodePickup {
			sources = append(sources, int32(v))
		}
		if t == routing.NodePickup || t == routing.NodeDropoff {
			dests = append(dests, int32(v))
		}
	}
	if len(sources) == 0 || len(dests) < 2 {
		log.Fatalf("need at least one pickup and two locations, got %d pickups, %d locations", len(sources), len(dests))
	}

	if *seed == 0 {
		*seed = time.Now().UnixNano()
	}
	rng := rand.New(rand.NewSource(*seed))

	// Draw all pairs up front so RNG cost stays out of the timings.
	type pair struct{ src, dst int32 }
	pairs := make([]pair, *warmup+*n)
	for i := range pairs {
		src := sources[rng.Intn(len(sources))]
		dst := src
		for dst == src {
			dst = dests[rng.Intn(len(dests))]
		}
		pairs[i] = pair{src, dst}
	}

	for _, p := range pairs[:*warmup] {
		if _, err := g.AStar(p.src, p.dst); err != nil {
			log.Fatalf("warmup %d -> %d: %v", p.src, p.dst, err)
		}
	}

	runtime.GC()
	durs := make([]time.Duration, *n)
	var expanded, hops int
	start := time.Now()
	for i, p := range pairs[*warmup:] {
		t0 := time.Now()
		res, err := g.AStar(p.src, p.dst)
		durs[i] = time.Since(t0)
		if err != nil {
			log.Fatalf("query %d -> %d: %v", p.src, p.dst, err)
		}
		expanded += res.Expanded
		hops += len(res.Path) - 1
	}
	wall := time.Since(start)

	slices.Sort(durs)
	var sum time.Duration
	for _, d := range durs {
		sum += d
	}
	// Nearest-rank percentile over the sorted durations.
	pct := func(p float64) time.Duration {
		i := int(p/100*float64(len(durs))+0.5) - 1
		return durs[max(0, min(i, len(durs)-1))]
	}

	fmt.Printf("graph:        %d nodes, %d edges, %d sources, %d destinations\n",
		g.NumNodes(), len(g.Edges), len(sources), len(dests))
	fmt.Printf("queries:      %d timed (+%d warmup), seed %d\n", *n, *warmup, *seed)
	fmt.Printf("wall time:    %v (%.0f queries/s)\n", wall.Round(time.Millisecond), float64(*n)/wall.Seconds())
	fmt.Printf("avg expanded: %.1f nodes, avg path: %.1f edges\n",
		float64(expanded)/float64(*n), float64(hops)/float64(*n))
	fmt.Println()
	fmt.Printf("mean   %v\n", sum/time.Duration(*n))
	fmt.Printf("min    %v\n", durs[0])
	for _, p := range []float64{50, 90, 95, 99, 99.9} {
		fmt.Printf("p%-5v %v\n", p, pct(p))
	}
	fmt.Printf("max    %v\n", durs[len(durs)-1])
}
