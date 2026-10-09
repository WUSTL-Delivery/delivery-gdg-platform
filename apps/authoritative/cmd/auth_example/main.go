package main

import (
	"log"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/security"
)

func main() {
	if err := security.ExampleProgram(); err != nil {
		log.Fatalf("auth example failed: %v", err)
	}
}
