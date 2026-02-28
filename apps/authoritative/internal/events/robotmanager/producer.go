package robotmanager

import (
	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/events"
	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
)

var robotManager string = "robot-manager"

type RobotPublisher struct {
	producer *kafka.Producer
}

func NewRobotPublisher(brokers string) (*RobotPublisher, error) {
	producer, err := events.CreateKafkaProducer(brokers, robotManager)
	if err != nil {
		return nil, err
	}

	return &RobotPublisher{
		producer: producer,
	}, err
}

func (p *RobotPublisher) PublishRobotUpdate(value []byte) error {
	return p.producer.Produce(&kafka.Message{
		TopicPartition: kafka.TopicPartition{Topic: &events.RobotUpdate, Partition: kafka.PartitionAny},
		Value:          value,
	}, nil)
}

func (kp *RobotPublisher) Close() {
	// Wait for outstanding messages to be delivered
	kp.producer.Flush(15 * 1000) // 15 seconds
	kp.producer.Close()
}
