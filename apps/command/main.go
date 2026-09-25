package main

// Entry point for the command server.
//
//   go run .                  # servers + simulated test clients (demo)
//   go run . -mode=server     # TCP (:8080) + UDP (:8081) servers only (what Docker runs)
//   go run . -mode=client     # simulated robot/person clients only
func main() {
	RunNetworkDemo()
}
