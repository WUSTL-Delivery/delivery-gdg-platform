package state

import (
	"fmt"
	"sync"
	"time"
)

// in memory register of robot states

// Manager handles all robot and order state management
type Manager struct {
	mu     sync.RWMutex
	robots map[string]*RobotState // robotID -> RobotState
	orders map[string]*OrderState // orderID -> OrderState
}

// NewManager creates a new state manager
func NewManager() *Manager {
	return &Manager{
		robots: make(map[string]*RobotState),
		orders: make(map[string]*OrderState),
	}
}

// UpdatePosition updates a robot's position
func (m *Manager) UpdatePosition(robotID string, lat, lon, heading, speed float64, timestamp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	robot, exists := m.robots[robotID]
	if !exists {
		// Create new robot state if it doesn't exist
		robot = &RobotState{
			RobotID:  robotID,
			Status:   StatusUnknown,
			IsOnline: true,
		}
		m.robots[robotID] = robot
	}

	robot.Position = Position{
		Latitude:  lat,
		Longitude: lon,
		Heading:   heading,
		Speed:     speed,
		Timestamp: timestamp,
	}
	robot.LastUpdated = time.Now()
	robot.IsOnline = true

	return nil
}

// UpdateBattery updates a robot's battery information
func (m *Manager) UpdateBattery(robotID string, level float32, isCharging bool, timestamp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	robot, exists := m.robots[robotID]
	if !exists {
		// Create new robot state if it doesn't exist
		robot = &RobotState{
			RobotID:  robotID,
			Status:   StatusUnknown,
			IsOnline: true,
		}
		m.robots[robotID] = robot
	}

	robot.Battery = BatteryInfo{
		Level:      level,
		IsCharging: isCharging,
		Timestamp:  timestamp,
	}
	robot.LastUpdated = time.Now()
	robot.IsOnline = true

	return nil
}

// UpdateStatus updates a robot's status
func (m *Manager) UpdateStatus(robotID string, status RobotStatus, currentOrderID, errorMessage string, timestamp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	robot, exists := m.robots[robotID]
	if !exists {
		// Create new robot state if it doesn't exist
		robot = &RobotState{
			RobotID:  robotID,
			IsOnline: true,
		}
		m.robots[robotID] = robot
	}

	robot.Status = status
	robot.CurrentOrderID = currentOrderID
	robot.ErrorMessage = errorMessage
	robot.LastUpdated = time.Now()
	robot.IsOnline = true

	return nil
}

// GetRobotState retrieves the current state of a robot
func (m *Manager) GetRobotState(robotID string) (*RobotState, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	robot, exists := m.robots[robotID]
	if !exists {
		return nil, fmt.Errorf("robot %s not found", robotID)
	}

	// Return a copy to avoid race conditions
	robotCopy := *robot
	return &robotCopy, nil
}

// GetAllRobots retrieves all robot states
func (m *Manager) GetAllRobots() map[string]*RobotState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Return a copy of the map
	robotsCopy := make(map[string]*RobotState, len(m.robots))
	for id, robot := range m.robots {
		robotCopy := *robot
		robotsCopy[id] = &robotCopy
	}
	return robotsCopy
}

// GetAvailableRobots returns robots that are idle and have sufficient battery
func (m *Manager) GetAvailableRobots(minBattery float32) []*RobotState {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var available []*RobotState
	for _, robot := range m.robots {
		if robot.Status == StatusIdle &&
			robot.Battery.Level >= minBattery &&
			robot.IsOnline &&
			!robot.Battery.IsCharging {
			robotCopy := *robot
			available = append(available, &robotCopy)
		}
	}
	return available
}

// MarkRobotOffline marks a robot as offline
func (m *Manager) MarkRobotOffline(robotID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	robot, exists := m.robots[robotID]
	if !exists {
		return fmt.Errorf("robot %s not found", robotID)
	}

	robot.IsOnline = false
	robot.Status = StatusOffline
	robot.LastUpdated = time.Now()

	return nil
}

// CreateOrder creates a new order
func (m *Manager) CreateOrder(orderID string, pickupLat, pickupLon, dropoffLat, dropoffLon float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.orders[orderID]; exists {
		return fmt.Errorf("order %s already exists", orderID)
	}

	now := time.Now()
	m.orders[orderID] = &OrderState{
		OrderID: orderID,
		PickupLocation: Position{
			Latitude:  pickupLat,
			Longitude: pickupLon,
			Timestamp: now,
		},
		DropoffLocation: Position{
			Latitude:  dropoffLat,
			Longitude: dropoffLon,
			Timestamp: now,
		},
		Status:    "pending",
		CreatedAt: now,
		UpdatedAt: now,
	}

	return nil
}

// AssignOrderToRobot assigns an order to a robot
func (m *Manager) AssignOrderToRobot(orderID, robotID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	order, exists := m.orders[orderID]
	if !exists {
		return fmt.Errorf("order %s not found", orderID)
	}

	robot, exists := m.robots[robotID]
	if !exists {
		return fmt.Errorf("robot %s not found", robotID)
	}

	order.AssignedRobot = robotID
	order.Status = "assigned"
	order.UpdatedAt = time.Now()

	robot.CurrentOrderID = orderID
	robot.Status = StatusAssigned
	robot.LastUpdated = time.Now()

	return nil
}
