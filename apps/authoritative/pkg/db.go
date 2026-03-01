package db

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	supabase "github.com/supabase-community/supabase-go"

	"github.com/joho/godotenv"
)

type Database struct {
	client *supabase.Client
}

func New() *Database {
	godotenv.Load(".env")
	url := os.Getenv("SUPABASE_URL")
	apiKey := os.Getenv("SUPABASE_KEY")
	client, err := supabase.NewClient(url, apiKey, nil)
	if err != nil {
		panic(fmt.Sprintf("db.New: failed to create supabase client: %v", err))
	}
	return &Database{client: client}
}

// Coordinate Type Enum
// 1 = Vendor
// 2 = Dropoff
// 3 = Waypoint

type CoordinateType int16

const (
	CoordinateTypeVendor   CoordinateType = 1
	CoordinateTypeDropoff  CoordinateType = 2
	CoordinateTypeWaypoint CoordinateType = 3
)

type Coordinate struct {
	ID   string         `json:"id"`
	X    int            `json:"x"`
	Y    int            `json:"y"`
	Meta interface{}    `json:"meta"`
	Type CoordinateType `json:"type"`
}

type OrderItem struct {
	ID       string  `json:"id"`
	OrderID  int64   `json:"orderId"`
	ItemName string  `json:"itemName"`
	Quantity int     `json:"quantity"`
	Price    float64 `json:"price"`
}

type Order struct {
	ID              int64  `json:"id"`
	UserID          string `json:"userId"`
	VendorID        string `json:"vendorId"`
	Status          int    `json:"status"`
	CreatedAt       string `json:"createdAt"`
	RobotID         string `json:"robotId"`
	DropOffLocation string `json:"dropOffLocation"`
}

type Robot struct {
	ID         string `json:"id"`
	Status     int    `json:"status"`
	LastUpdate string `json:"lastUpdate"`
	CurrentLoc string `json:"currentLoc"`
}

type User struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	PhoneNum string `json:"phoneNum"`
}

type Vendor struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Address     string      `json:"address"`
	Hours       interface{} `json:"hours"`
	Coordinates string      `json:"coordinates"`
}

// *
func (db *Database) InsertCoordinate(ctx context.Context, c Coordinate) error {
	data := map[string]interface{}{
		"x":    c.X,
		"y":    c.Y,
		"meta": c.Meta,
		"type": c.Type,
	}

	_, _, err := db.client.From("coordinates").Insert(data, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("InsertCoordinate: %w", err)
	}
	return nil
}

func (db *Database) GetCoordinate(ctx context.Context, id string) (Coordinate, error) {
	return Coordinate{}, nil
}

func (db *Database) ListCoordinates(ctx context.Context) ([]Coordinate, error) {
	return nil, nil
}

func (db *Database) DeleteCoordinate(ctx context.Context, id string) error { return nil }

// *
func (db *Database) CreateOrder(ctx context.Context, o Order) error {
	data := map[string]interface{}{
		"userId":          o.UserID,
		"vendorId":        o.VendorID,
		"status":          o.Status,
		"dropOffLocation": o.DropOffLocation,
	}
	if o.RobotID != "" {
		data["robotId"] = o.RobotID
	}
	_, _, err := db.client.From("orders").Insert(data, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("CreateOrder: %w", err)
	}
	return nil
}

// *
func (db *Database) GetOrder(ctx context.Context, id int64) (Order, error) {
	res, _, err := db.client.From("orders").Select("*", "exact", false).Eq("id", strconv.FormatInt(id, 10)).Execute()
	if err != nil {
		return Order{}, fmt.Errorf("GetOrder: %w", err)
	}
	var orders []Order
	if err := json.Unmarshal(res, &orders); err != nil {
		return Order{}, fmt.Errorf("GetOrder unmarshal: %w", err)
	}
	if len(orders) == 0 {
		return Order{}, fmt.Errorf("GetOrder: order %d not found", id)
	}
	return orders[0], nil
}

// *
func (db *Database) ListOrdersByUser(ctx context.Context, userID string) ([]Order, error) {
	res, _, err := db.client.From("orders").Select("*", "exact", false).Eq("userId", userID).Execute()
	if err != nil {
		return nil, fmt.Errorf("ListOrdersByUser: %w", err)
	}
	var orders []Order
	if err := json.Unmarshal(res, &orders); err != nil {
		return nil, fmt.Errorf("ListOrdersByUser unmarshal: %w", err)
	}
	return orders, nil
}

func (db *Database) ListOrdersByVendor(ctx context.Context, vendorID string) ([]Order, error) {
	return nil, nil
}

// *
func (db *Database) UpdateOrderStatus(ctx context.Context, id int64, status int) error {
	data := map[string]interface{}{"status": status}
	_, _, err := db.client.From("orders").Update(data, "", "").Eq("id", strconv.FormatInt(id, 10)).Execute()
	if err != nil {
		return fmt.Errorf("UpdateOrderStatus: %w", err)
	}
	return nil
}

// *
func (db *Database) AssignOrderToRobot(ctx context.Context, orderID int64, robotID string) error {
	data := map[string]interface{}{"robotId": robotID}
	_, _, err := db.client.From("orders").Update(data, "", "").Eq("id", strconv.FormatInt(orderID, 10)).Execute()
	if err != nil {
		return fmt.Errorf("AssignOrderToRobot: %w", err)
	}
	return nil
}

func (db *Database) DeleteOrder(ctx context.Context, id int64) error { return nil }

func (db *Database) CreateOrderWithItems(ctx context.Context, order Order, items []OrderItem) error {
	return nil
}

func (db *Database) AddOrderItem(ctx context.Context, item OrderItem) error { return nil }
func (db *Database) GetOrderItems(ctx context.Context, orderID int64) ([]OrderItem, error) {
	return nil, nil
}
func (db *Database) DeleteOrderItem(ctx context.Context, id string) error { return nil }

func (db *Database) GetRobot(ctx context.Context, id string) (Robot, error)          { return Robot{}, nil }
func (db *Database) SetRobotStatus(ctx context.Context, id string, status int) error { return nil }
func (db *Database) UpdateRobotLocation(ctx context.Context, id string, coordinateID string) error {
	return nil
}
func (db *Database) ListRobots(ctx context.Context) ([]Robot, error)  { return nil, nil }
func (db *Database) DeleteRobot(ctx context.Context, id string) error { return nil }

func (db *Database) InsertUser(ctx context.Context, u User) error         { return nil }
func (db *Database) GetUser(ctx context.Context, id string) (User, error) { return User{}, nil }
func (db *Database) ListUsers(ctx context.Context) ([]User, error)        { return nil, nil }
func (db *Database) DeleteUser(ctx context.Context, id string) error      { return nil }

func (db *Database) InsertVendor(ctx context.Context, v Vendor) error         { return nil }
func (db *Database) GetVendor(ctx context.Context, id string) (Vendor, error) { return Vendor{}, nil }
func (db *Database) ListVendors(ctx context.Context) ([]Vendor, error)        { return nil, nil }
func (db *Database) DeleteVendor(ctx context.Context, id string) error        { return nil }
