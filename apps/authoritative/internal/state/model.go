package state

import "time"

// Robot state, jobs, position definitions

// RobotStatus represents the current state of a robot
type RobotStatus string

const (
	StatusUnknown         RobotStatus = "UNKNOWN"
	StatusIdle            RobotStatus = "IDLE"
	StatusAssigned        RobotStatus = "ASSIGNED"
	StatusMovingToPickup  RobotStatus = "MOVING_TO_PICKUP"
	StatusAtPickup        RobotStatus = "AT_PICKUP"
	StatusMovingToDropoff RobotStatus = "MOVING_TO_DROPOFF"
	StatusAtDropoff       RobotStatus = "AT_DROPOFF"
	StatusReturning       RobotStatus = "RETURNING"
	StatusCharging        RobotStatus = "CHARGING"
	StatusOffline         RobotStatus = "OFFLINE"
	StatusError           RobotStatus = "ERROR"
	StatusMaintenance     RobotStatus = "MAINTENANCE"
)

// Position represents a geographic location
type Position struct {
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Heading   float64   `json:"heading"` // Direction in degrees (0-360)
	Speed     float64   `json:"speed"`   // Speed in m/s
	Timestamp time.Time `json:"timestamp"`
}

// BatteryInfo represents battery status
type BatteryInfo struct {
	Level      float32   `json:"level"` // Battery percentage (0-100)
	IsCharging bool      `json:"is_charging"`
	Timestamp  time.Time `json:"timestamp"`
}

// RobotState represents the complete state of a robot
type RobotState struct {
	RobotID        string      `json:"robot_id"`
	Status         RobotStatus `json:"status"`
	Position       Position    `json:"position"`
	Battery        BatteryInfo `json:"battery"`
	CurrentOrderID string      `json:"current_order_id,omitempty"`
	ErrorMessage   string      `json:"error_message,omitempty"`
	LastUpdated    time.Time   `json:"last_updated"`
	IsOnline       bool        `json:"is_online"`
}

// OrderState represents an active delivery order
type OrderState struct {
	OrderID         string    `json:"order_id"`
	AssignedRobot   string    `json:"assigned_robot,omitempty"`
	PickupLocation  Position  `json:"pickup_location"`
	DropoffLocation Position  `json:"dropoff_location"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
