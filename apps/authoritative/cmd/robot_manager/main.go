package main

import (
	"log"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/events/robotmanager"
)

func main() {
	producer, err := robotmanager.NewRobotPublisher(robotmanager.Brokers)
	if err != nil {
		log.Fatalf("failed to create producer: %v", err)
	}

	defer producer.Close()

}
