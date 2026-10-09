package routing

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"
)

const (
	NodePath int8 = 0
	NodeCrosswalk int8 = 1
	NodePickup int8 = 2
	NodeDropoff int8 = 3
)

type Location struct {
	Node int32
	Pickup bool
	Dropoff bool
	Name string
}

type Graph struct {
	X, Y          []float64 // pixel coords in the source drawing (y points down)
	NodeType      []int8
	Edges         [][2]int32 // undirected, Edges[e] = {u, v}
	Weights       []float64  // one weight per undirected edge; update here
	EdgeLengthPx  []float64
	EdgeCrosswalk []bool
	PickupNodes   []int32
	// CSR adjacency: neighbors of u are Indices[Indptr[u]:Indptr[u+1]],
	// and EdgeID gives the index into Edges/Weights for each of those.
	Indptr  []int64
	Indices []int32
	EdgeID  []int32
}

func (g *Graph) NumNodes() int { return len(g.X) }

// SetWeight updates an undirected edge
func (g *Graph) SetWeight(edge int, w float64) { g.Weights[edge] = w }

type npyArray struct {
	descr string
	shape []int
	data  []byte
}

var (
	reDescr = regexp.MustCompile(`'descr':\s*'([^']+)'`)
	reFort  = regexp.MustCompile(`'fortran_order':\s*(True|False)`)
	reShape = regexp.MustCompile(`'shape':\s*\(([^)]*)\)`)
)

func parseNpy(b []byte) (*npyArray, error) {
	if len(b) < 10 || !bytes.Equal(b[:6], []byte("\x93NUMPY")) {
		return nil, fmt.Errorf("not an npy file")
	}
	var hlen, off int
	if b[6] == 1 {
		hlen, off = int(binary.LittleEndian.Uint16(b[8:10])), 10
	} else {
		hlen, off = int(binary.LittleEndian.Uint32(b[8:12])), 12
	}
	hdr := string(b[off : off+hlen])
	a := &npyArray{data: b[off+hlen:]}
	m := reDescr.FindStringSubmatch(hdr)
	if m == nil {
		return nil, fmt.Errorf("bad header %q", hdr)
	}
	a.descr = m[1]
	if f := reFort.FindStringSubmatch(hdr); f != nil && f[1] == "True" {
		return nil, fmt.Errorf("fortran order not supported")
	}
	if s := reShape.FindStringSubmatch(hdr); s != nil {
		for _, p := range strings.Split(s[1], ",") {
			if p = strings.TrimSpace(p); p != "" {
				n, err := strconv.Atoi(p)
				if err != nil {
					return nil, err
				}
				a.shape = append(a.shape, n)
			}
		}
	}
	return a, nil
}

func (a *npyArray) count() int {
	n := 1
	for _, s := range a.shape {
		n *= s
	}
	return n
}

func (a *npyArray) float64s() ([]float64, error) {
	if a.descr != "<f8" {
		return nil, fmt.Errorf("want <f8, got %s", a.descr)
	}
	out := make([]float64, a.count())
	for i := range out {
		out[i] = math.Float64frombits(binary.LittleEndian.Uint64(a.data[8*i:]))
	}
	return out, nil
}

func (a *npyArray) ints() ([]int64, error) {
	out := make([]int64, a.count())
	for i := range out {
		switch a.descr {
		case "|i1":
			out[i] = int64(int8(a.data[i]))
		case "|u1", "|b1":
			out[i] = int64(a.data[i])
		case "<i4":
			out[i] = int64(int32(binary.LittleEndian.Uint32(a.data[4*i:])))
		case "<i8":
			out[i] = int64(binary.LittleEndian.Uint64(a.data[8*i:]))
		default:
			return nil, fmt.Errorf("unsupported int dtype %s", a.descr)
		}
	}
	return out, nil
}

func Load(path string) (*Graph, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	arrs := map[string]*npyArray{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		a, err := parseNpy(b)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", f.Name, err)
		}
		arrs[strings.TrimSuffix(f.Name, ".npy")] = a
	}
	get := func(k string) (*npyArray, error) {
		if a, ok := arrs[k]; ok {
			return a, nil
		}
		return nil, fmt.Errorf("missing array %q", k)
	}
	ints := func(k string) ([]int64, error) {
		a, err := get(k)
		if err != nil {
			return nil, err
		}
		return a.ints()
	}
	floats := func(k string) ([]float64, error) {
		a, err := get(k)
		if err != nil {
			return nil, err
		}
		return a.float64s()
	}

	g := &Graph{}
	xy, err := floats("node_xy")
	if err != nil {
		return nil, err
	}
	n := len(xy) / 2
	g.X, g.Y = make([]float64, n), make([]float64, n)
	for i := 0; i < n; i++ {
		g.X[i], g.Y[i] = xy[2*i], xy[2*i+1]
	}
	nt, err := ints("node_type")
	if err != nil {
		return nil, err
	}
	g.NodeType = make([]int8, n)
	for i, v := range nt {
		g.NodeType[i] = int8(v)
	}
	e, err := ints("edges")
	if err != nil {
		return nil, err
	}
	g.Edges = make([][2]int32, len(e)/2)
	for i := range g.Edges {
		g.Edges[i] = [2]int32{int32(e[2*i]), int32(e[2*i+1])}
	}
	if g.Weights, err = floats("weights"); err != nil {
		return nil, err
	}
	if g.EdgeLengthPx, err = floats("edge_length_px"); err != nil {
		return nil, err
	}
	cw, err := ints("edge_crosswalk")
	if err != nil {
		return nil, err
	}
	g.EdgeCrosswalk = make([]bool, len(cw))
	for i, v := range cw {
		g.EdgeCrosswalk[i] = v != 0
	}
	pk, err := ints("pickup_nodes")
	if err != nil {
		return nil, err
	}
	for _, v := range pk {
		g.PickupNodes = append(g.PickupNodes, int32(v))
	}
	if g.Indptr, err = ints("csr_indptr"); err != nil {
		return nil, err
	}
	ind, err := ints("csr_indices")
	if err != nil {
		return nil, err
	}
	eid, err := ints("csr_edge_id")
	if err != nil {
		return nil, err
	}
	g.Indices, g.EdgeID = make([]int32, len(ind)), make([]int32, len(eid))
	for i := range ind {
		g.Indices[i], g.EdgeID[i] = int32(ind[i]), int32(eid[i])
	}
	return g, nil
}