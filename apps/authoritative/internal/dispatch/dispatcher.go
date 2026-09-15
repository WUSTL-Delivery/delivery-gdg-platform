package dispatch

import "fmt"

// Logic and routines for assigning tasks to robots
type RobotState int

const(
	Idle RobotState = iota
	Busy
	Maintenance
	Charging
)

type RobotLocation int

const(
	AtBase RobotLocation = iota
	BeastCraft
	Corner17
	DUC
	MuddField
	InTransit
)

type Robot struct {
	ID string
	State RobotState
	BatteryLevel int // Percentage
	RecipientID string // ID of the recipient for delivery tasks
	CurrentLocation RobotLocation
	PickupLocation RobotLocation
	DropoffLocation RobotLocation
}

type Order struct {
	RecipientID string
	PickupLocation RobotLocation
	DropoffLocation RobotLocation
}

type Dispatcher struct {
	robots []Robot
}

type OrderQueue struct {
	orders []Order
}

const MinTaskBattery = 20

func NewDispatcher() *Dispatcher {
	return &Dispatcher{robots: make([]Robot, 0)}
}

func clampBattery(level int) int {
	if level < 0 {
		return 0
	}
	if level > 100 {
		return 100
	}
	return level
}

func (d *Dispatcher) findRobotIndex(robotID string) int {
	for i, robot := range d.robots {
		if robot.ID == robotID {
			return i
		}
	}
	return -1
}

func validateOrder(order Order) error {
	if order.RecipientID == "" {
		return fmt.Errorf("recipient ID is required")
	}
	if order.PickupLocation == InTransit || order.DropoffLocation == InTransit {
		return fmt.Errorf("pickup and dropoff locations cannot be in transit")
	}
	return nil
}

func (d *Dispatcher) AssignTask(robotID string, order Order) (string, error) {
	if err := validateOrder(order); err != nil {
		return "", err
	}

	// If robotID is provided, assign the task to that robot.
	if robotID != "" {
		i := d.findRobotIndex(robotID)
		if i == -1 {
			return "", fmt.Errorf("robot with ID %s not found", robotID)
		}
		if d.robots[i].State != Idle {
			return "", fmt.Errorf("robot with ID %s is not idle", robotID)
		}
		if d.robots[i].BatteryLevel < MinTaskBattery {
			return "", fmt.Errorf("robot with ID %s has insufficient battery", robotID)
		}

		d.robots[i].State = Busy
		d.robots[i].RecipientID = order.RecipientID
		d.robots[i].PickupLocation = order.PickupLocation
		d.robots[i].DropoffLocation = order.DropoffLocation
		d.robots[i].CurrentLocation = order.PickupLocation
		return d.robots[i].ID, nil
	}

	// Otherwise, auto-select best idle robot by highest battery.
	bestRobotID, err := d.GetBestRobotForTask()
	if err != nil {
		return "", err
	}

	i := d.findRobotIndex(bestRobotID)
	d.robots[i].State = Busy
	d.robots[i].RecipientID = order.RecipientID
	d.robots[i].PickupLocation = order.PickupLocation
	d.robots[i].DropoffLocation = order.DropoffLocation
	d.robots[i].CurrentLocation = order.PickupLocation

	return d.robots[i].ID, nil
}

func (d *Dispatcher) UpdateRobotState(robotID string, newState RobotState) error {
	// Update the state of a robot by ID
	for i, robot := range d.robots {
		if robot.ID == robotID {
			d.robots[i].State = newState
			return nil
		}
	}
	return fmt.Errorf("robot with ID %s not found", robotID)
}

func (d *Dispatcher) GetRobotStates() map[string]RobotState {
	// Return a map of robot IDs to their current states
	states := make(map[string]RobotState)
	for _, robot := range d.robots {
		states[robot.ID] = robot.State
	}
	return states
}

func (d *Dispatcher) GetBestRobotForTask() (string, error){
	// Find the idle robot with the highest battery level and return its ID
	var bestRobotID string
	highestBattery := -1
	for _, robot := range d.robots {
		if robot.State == Idle && robot.BatteryLevel >= MinTaskBattery && robot.BatteryLevel > highestBattery {
			bestRobotID = robot.ID
			highestBattery = robot.BatteryLevel
		}
	}
	if bestRobotID == "" {
		return "", fmt.Errorf("no idle robots available with sufficient battery")
	}
	return bestRobotID, nil
}

func (d *Dispatcher) AddRobot(robotID string, batteryLevel int) {
	// Add a new robot with a known battery level to the dispatcher
	if robotID == "" {
		return
	}

	if i := d.findRobotIndex(robotID); i != -1 {
		d.robots[i].BatteryLevel = clampBattery(batteryLevel)
		return
	}

	d.robots = append(d.robots, Robot{
		ID: robotID,
		State: Idle,
		BatteryLevel: clampBattery(batteryLevel),
		RecipientID: "",
		CurrentLocation: AtBase,
		PickupLocation: AtBase,
		DropoffLocation: AtBase,
	})
}

func (d *Dispatcher) RemoveRobot(robotID string) error {
	// Remove a robot from the dispatcher by ID
	for i, robot := range d.robots {
		if robot.ID == robotID {
			d.robots = append(d.robots[:i], d.robots[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("robot with ID %s not found", robotID)
}

func (d* Dispatcher) GetRobotInfo(robotID string) (*Robot, error) {
	// Get detailed information about a robot by ID
	i := d.findRobotIndex(robotID)
	if i != -1 {
		return &d.robots[i], nil
	}
	return nil, fmt.Errorf("robot with ID %s not found", robotID)
}

func (d *Dispatcher) UpdateRobotTask(robotID string, order Order) error {
	// Update the task details for a specific robot
	for i, robot := range d.robots {
		if robot.ID == robotID {
			d.robots[i].RecipientID = order.RecipientID
			d.robots[i].PickupLocation = order.PickupLocation
			d.robots[i].DropoffLocation = order.DropoffLocation
			return nil
		}
	}
	return fmt.Errorf("robot with ID %s not found", robotID)
}