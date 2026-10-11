# Command Server

A TCP + UDP relay for real-time messages between robots and other clients. Every message a
client sends is broadcast to the other connected clients. It doesn't contain any dispatch or
routing logic yet.

## Run

```bash
cd apps/command
go run . -mode=server     # TCP :8080 + UDP :8081 (what Docker runs; host ports 8082/tcp, 8081/udp)
go run . -mode=client     # simulated robot/person clients against a running server
go run .                  # both, as a demo
./test_network.sh         # interactive menu of demos
```

## Layout

| File | What |
|------|------|
| `main.go`, `network_demo.go` | Entry point and `-mode` handling |
| `tcp_server.go`, `udp_server.go` | Servers and broadcast |
| `tcp_client.go`, `udp_client.go`, `test_clients.go` | Example and test clients |
| `demo_standalone.go`, `demos/`, `examples.go` | Demos |

Where it fits: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
