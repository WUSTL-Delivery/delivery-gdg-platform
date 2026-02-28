package wsockets

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/WUSTL-Delivery/delivery-gdg-platform/main/apps/authoritative/internal/matcher"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

type Hub struct {
	clients    map[string]*Client
	rClients   map[string]string
	orm        *matcher.OrderRobotMatcher
	matches    chan (*matcher.OrderRobotMatch)
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

type Client struct {
	ID      string
	RobotID *string
	status  string
	hub     *Hub
	conn    *websocket.Conn
	send    chan []byte
}

func NewHub(orm *matcher.OrderRobotMatcher, match chan (*matcher.OrderRobotMatch)) *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		rClients:   make(map[string]string),
		matches:    match,
		orm:        orm,
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("Client connected. Total clients: %d", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			h.robotUpdate(client, &RobotUpdate{
				Status:  "shutdown",
				RobotID: *client.RobotID,
			})
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected. Total clients: %d", len(h.clients))

		case message := <-h.broadcast:
			h.mu.RLock()
			for clientID, client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, clientID)
				}
			}
			h.mu.RUnlock()
		case match := <-h.matches:
			clientID, ok := h.rClients[match.RobotID]
			if !ok {
				fmt.Printf("robot id is not mapped to client id, got %s", clientID)
				return
			}
			h.handleMatch(match, clientID)

		}
	}
}

func (h *Hub) handleMatch(match *matcher.OrderRobotMatch, clientID string) {
	robotID := match.RobotID

	rClient := h.clients[clientID]

	if rClient == nil {
		fmt.Printf("robot does not exist %s\n", robotID)
		return
	}

	h.mu.RLock()

	h.clients[rClient.ID].status = "delivery"

	h.mu.RUnlock()

	data, err := json.Marshal(&RobotMatch{
		RobotID: robotID,
		OrderID: match.OrderID,
	})
	if err != nil {
		fmt.Printf("failed to marhal match data")
	}

	rClient.send <- data
}

// first emit is online, then is ready
func (h *Hub) robotUpdate(c *Client, rUpdate *RobotUpdate) {
	status := rUpdate.Status
	rID := &rUpdate.RobotID

	switch status {
	case "online":
		if c.RobotID == nil {
			c.RobotID = rID
			h.mu.RLock()
			h.rClients[*rID] = c.ID
			h.mu.RUnlock()
		} else if c.RobotID != rID {
			fmt.Printf("Robot ID does not match up, expected: %s got: %s", *c.RobotID, *rID)
			return
		}
		c.status = "online"
		ormRUpdate := matcher.NewRobotUpdate(status, *rID)
		h.orm.SubmitRobot(ormRUpdate)
	case "shutdown":
		if c.RobotID == nil {
			return
		}
		h.mu.RLock()
		delete(h.rClients, *c.RobotID)
		h.mu.RUnlock()

		ormRUpdate := matcher.NewRobotUpdate(status, *rID)
		h.orm.SubmitRobot(ormRUpdate)
	}
}

func (h *Hub) handleEvents(c *Client, msg *Message) {
	data, err := json.Marshal(msg.Payload)
	if err != nil {
		fmt.Print("error marshalling payload", err)
	}

	switch msg.Type {
	case "update":
		var robotUpdate RobotUpdate
		err = json.Unmarshal(data, &robotUpdate)
		if err != nil {
			fmt.Print("error marshalling payload", err)
		}
		h.robotUpdate(c, &robotUpdate)
		fmt.Printf("Robot %s status updated to %s\n", robotUpdate.RobotID, robotUpdate.Status)
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		log.Printf("Received: %s", message)
		var incomingMsg Message
		if err := json.Unmarshal(message, &incomingMsg); err != nil {
			log.Printf("Error unmarshalling JSON: %v", err)
			// Optionally send an error message back to the client
			continue
		}
		c.hub.handleEvents(c, &incomingMsg)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()

	for message := range c.send {
		err := c.conn.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Printf("write error: %v", err)
			return
		}
	}
}

func HandleWebSocket(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	newUUID, err := uuid.NewRandom()
	if err != nil {
		log.Fatalf("failed to generate UUID: %v", err)
	}

	clientID := newUUID.String()
	client := &Client{
		ID:   clientID,
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}

	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}
