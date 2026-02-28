package grpc

import (
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/state"
	pb "github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/proto"
)

// comms between author and robots

// RobotHandler handles incoming gRPC messages from robots
type RobotHandler struct {
	pb.UnimplementedRobotServiceServer
	stateManager *state.Manager
}

// NewRobotHandler creates a new robot handler
func NewRobotHandler(stateManager *state.Manager) *RobotHandler {
	return &RobotHandler{
		stateManager: stateManager,
	}
}

// UpdatePosition handles position updates from robots
func (h *RobotHandler) UpdatePosition(ctx context.Context, req *pb.PositionUpdate) (*pb.PositionAck, error) {
	log.Printf("Received position update from robot %s: lat=%f, lon=%f, heading=%f, speed=%f",
		req.RobotId, req.Latitude, req.Longitude, req.Heading, req.Speed)

	// Convert timestamp from milliseconds to time.Time
	timestamp := time.UnixMilli(req.Timestamp)

	// Update the state manager
	err := h.stateManager.UpdatePosition(
		req.RobotId,
		req.Latitude,
		req.Longitude,
		req.Heading,
		req.Speed,
		timestamp,
	)

	if err != nil {
		log.Printf("Error updating position for robot %s: %v", req.RobotId, err)
		return &pb.PositionAck{
			Success: false,
			Message: fmt.Sprintf("Failed to update position: %v", err),
		}, nil
	}

	return &pb.PositionAck{
		Success: true,
		Message: "Position updated successfully",
	}, nil
}

// UpdateBattery handles battery level updates from robots
func (h *RobotHandler) UpdateBattery(ctx context.Context, req *pb.BatteryUpdate) (*pb.BatteryAck, error) {
	log.Printf("Received battery update from robot %s: level=%f%%, charging=%t",
		req.RobotId, req.BatteryLevel, req.IsCharging)

	// Convert timestamp from milliseconds to time.Time
	timestamp := time.UnixMilli(req.Timestamp)

	// Update the state manager
	err := h.stateManager.UpdateBattery(
		req.RobotId,
		req.BatteryLevel,
		req.IsCharging,
		timestamp,
	)

	if err != nil {
		log.Printf("Error updating battery for robot %s: %v", req.RobotId, err)
		return &pb.BatteryAck{
			Success: false,
			Message: fmt.Sprintf("Failed to update battery: %v", err),
		}, nil
	}

	return &pb.BatteryAck{
		Success: true,
		Message: "Battery updated successfully",
	}, nil
}

// UpdateStatus handles status changes from robots
func (h *RobotHandler) UpdateStatus(ctx context.Context, req *pb.StatusUpdate) (*pb.StatusAck, error) {
	log.Printf("Received status update from robot %s: status=%s, order=%s",
		req.RobotId, req.Status.String(), req.CurrentOrderId)

	// Convert proto status to internal status
	status := convertProtoStatus(req.Status)

	// Convert timestamp from milliseconds to time.Time
	timestamp := time.UnixMilli(req.Timestamp)

	// Update the state manager
	err := h.stateManager.UpdateStatus(
		req.RobotId,
		status,
		req.CurrentOrderId,
		req.ErrorMessage,
		timestamp,
	)

	if err != nil {
		log.Printf("Error updating status for robot %s: %v", req.RobotId, err)
		return &pb.StatusAck{
			Success: false,
			Message: fmt.Sprintf("Failed to update status: %v", err),
		}, nil
	}

	return &pb.StatusAck{
		Success: true,
		Message: "Status updated successfully",
	}, nil
}

// StreamUpdates handles streaming updates from robots (more efficient for frequent updates)
func (h *RobotHandler) StreamUpdates(stream pb.RobotService_StreamUpdatesServer) error {
	log.Println("Robot connected to stream")

	for {
		update, err := stream.Recv()
		if err == io.EOF {
			log.Println("Robot disconnected from stream")
			return nil
		}
		if err != nil {
			log.Printf("Error receiving stream update: %v", err)
			return err
		}

		// Process the update based on type
		var ack *pb.UpdateAck
		switch u := update.Update.(type) {
		case *pb.RobotUpdate_Position:
			posAck, err := h.UpdatePosition(stream.Context(), u.Position)
			ack = &pb.UpdateAck{
				Success:   posAck.Success,
				Message:   posAck.Message,
				Timestamp: time.Now().UnixMilli(),
			}
			if err != nil {
				ack.Success = false
				ack.Message = fmt.Sprintf("Position update failed: %v", err)
			}

		case *pb.RobotUpdate_Battery:
			battAck, err := h.UpdateBattery(stream.Context(), u.Battery)
			ack = &pb.UpdateAck{
				Success:   battAck.Success,
				Message:   battAck.Message,
				Timestamp: time.Now().UnixMilli(),
			}
			if err != nil {
				ack.Success = false
				ack.Message = fmt.Sprintf("Battery update failed: %v", err)
			}

		case *pb.RobotUpdate_Status:
			statAck, err := h.UpdateStatus(stream.Context(), u.Status)
			ack = &pb.UpdateAck{
				Success:   statAck.Success,
				Message:   statAck.Message,
				Timestamp: time.Now().UnixMilli(),
			}
			if err != nil {
				ack.Success = false
				ack.Message = fmt.Sprintf("Status update failed: %v", err)
			}

		default:
			ack = &pb.UpdateAck{
				Success:   false,
				Message:   "Unknown update type",
				Timestamp: time.Now().UnixMilli(),
			}
		}

		// Send acknowledgment back to robot
		if err := stream.Send(ack); err != nil {
			log.Printf("Error sending ack: %v", err)
			return err
		}
	}
}

// convertProtoStatus converts protobuf RobotStatus to internal state.RobotStatus
func convertProtoStatus(protoStatus pb.RobotStatus) state.RobotStatus {
	switch protoStatus {
	case pb.RobotStatus_IDLE:
		return state.StatusIdle
	case pb.RobotStatus_ASSIGNED:
		return state.StatusAssigned
	case pb.RobotStatus_MOVING_TO_PICKUP:
		return state.StatusMovingToPickup
	case pb.RobotStatus_AT_PICKUP:
		return state.StatusAtPickup
	case pb.RobotStatus_MOVING_TO_DROPOFF:
		return state.StatusMovingToDropoff
	case pb.RobotStatus_AT_DROPOFF:
		return state.StatusAtDropoff
	case pb.RobotStatus_RETURNING:
		return state.StatusReturning
	case pb.RobotStatus_CHARGING:
		return state.StatusCharging
	case pb.RobotStatus_OFFLINE:
		return state.StatusOffline
	case pb.RobotStatus_ERROR:
		return state.StatusError
	case pb.RobotStatus_MAINTENANCE:
		return state.StatusMaintenance
	default:
		return state.StatusUnknown
	}
}
