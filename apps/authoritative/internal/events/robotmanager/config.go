package robotmanager

import "os"

// Brokers is the Kafka bootstrap server list. Defaults to the host-exposed
// listener for `go run` on a laptop; docker-compose sets KAFKA_BROKERS to the
// in-network listener (kafka:9093).
var Brokers string = envOr("KAFKA_BROKERS", "localhost:9092")

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
