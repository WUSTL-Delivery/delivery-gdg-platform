package robotmanager

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/events"
	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
)

type RobotConsumer struct {
	consumer *kafka.Consumer
}

func NewRobotSubscriber(brokers string, clientID string, topics []string) (*RobotConsumer, error) {
	consumer, err := events.CreateKafkaConsumer(brokers, clientID, topics)
	if err != nil {
		return nil, err
	}

	return &RobotConsumer{
		consumer: consumer,
	}, nil
}

func (rc *RobotConsumer) ConsumeMessages(ctx context.Context, handlers map[string]func([]byte) error) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := rc.consumer.ReadMessage(100 * time.Millisecond)
			if err != nil {
				if err.(kafka.Error).Code() == kafka.ErrTimedOut {
					continue
				}
				return fmt.Errorf("consumer error: %w", err)
			}

			handler, exists := handlers[*msg.TopicPartition.Topic]
			if !exists {
				log.Printf("No handler for topic: %s", *msg.TopicPartition.Topic)
				continue
			}

			if err := handler(msg.Value); err != nil {
				log.Printf("Handler failed for topic %s: %v\n", *msg.TopicPartition.Topic, err)
				continue
			}

			if _, err := rc.consumer.CommitMessage(msg); err != nil {
				log.Printf("Failed to commit message: %v\n", err)
			}
		}
	}
}
